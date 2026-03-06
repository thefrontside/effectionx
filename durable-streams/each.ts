/**
 * durableEach — durable iteration primitive for Effection workflows.
 *
 * Mirrors Effection's `each()` / `each.next()` pattern but journals
 * every fetch as a DurableEffect, so iteration survives crashes and
 * replays from the journal.
 *
 * Usage:
 *   for (let msg of yield* durableEach("queue", source)) {
 *     yield* durableCall("process", () => process(msg));
 *     yield* durableEach.next();
 *   }
 *
 * See effection-integration.md §12.6 for the full design.
 */

import { ensure } from "effection";
import type { Operation } from "effection";
import { createDurableOperation } from "./effect.ts";
import { ephemeral } from "./ephemeral.ts";
import type { Json, Workflow } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * Source of items for durable iteration.
 *
 * Each call to `next()` blocks until the next item is available.
 * Returns `{ value: T }` for an item, `{ done: true }` for exhaustion.
 *
 * The `{ done: true }` wrapper (rather than `T | null`) avoids ambiguity
 * when `null` is a legitimate JSON value from the source.
 */
export interface DurableSource<T extends Json> {
  /** Read the next item, blocking until available. */
  next(): Operation<{ value: T } | { done: true }>;
  /**
   * Teardown — called on cancellation or completion.
   *
   * Must be idempotent: may be called more than once (once from effect
   * teardown during an in-flight fetch, once from scope cleanup via
   * ensure()). Subsequent calls after the first should be no-ops.
   */
  close?(): void;
}

// ---------------------------------------------------------------------------
// Internal state
// ---------------------------------------------------------------------------

/** Sentinel for source exhaustion. Not exported — cannot collide with JSON. */
const DONE: unique symbol = Symbol("durableEach.done");
type ItemOrDone<T> = T | typeof DONE;

/** Type guard for the DONE sentinel. */
function isDone<T>(value: ItemOrDone<T>): value is typeof DONE {
  return value === DONE;
}

/** State shared between durableEach and durableEach.next(). */
interface DurableEachState<T extends Json> {
  name: string;
  source: DurableSource<T>;
  current: ItemOrDone<T>;
  advanced: boolean;
}

/**
 * Module-level active state for sharing between durableEach() and durableEach.next().
 *
 * Safe because durable execution is single-threaded — only one coroutine
 * runs at a time, so there's no concurrent access. durableEach() sets this
 * before returning the iterable; durableEach.next() reads it directly.
 *
 * This avoids using Effection context, which doesn't work when both
 * functions are individually wrapped in ephemeral() (each gets its own
 * child scope, making context invisible across them).
 */
let activeState: DurableEachState<Json> | null = null;

// ---------------------------------------------------------------------------
// durableEachFetch — shared helper for fetching one item
// ---------------------------------------------------------------------------

/**
 * Fetch a single item from the source (or replay it from the journal).
 *
 * Both the initial fetch (inside durableEach) and subsequent fetches
 * (inside durableEach.next) go through this helper. Same effect
 * description, same journal format, same replay path.
 *
 * Uses createDurableOperation to run the source's Operation-native next()
 * with full structured concurrency — cancellation of the scope cancels
 * the in-flight source.next() call.
 *
 * Journal shape: Yield event with description { type: "each", name }
 * and result value { value: T } | { done: true }.
 */
function durableEachFetch<T extends Json>(
  name: string,
  source: DurableSource<T>,
): Workflow<ItemOrDone<T>> {
  return (function* () {
    const result = (yield createDurableOperation<{ value: T } | { done: true }>(
      { type: "each", name },
      () => source.next(),
    )) as { value: T } | { done: true };

    if ("done" in result) return DONE;
    return result.value;
  })();
}

// ---------------------------------------------------------------------------
// durableEach — initial fetch + returns synchronous iterable
// ---------------------------------------------------------------------------

/**
 * Durable iteration over a DurableSource (internal implementation).
 *
 * Returns Operation<Iterable<T>> because it uses ensure() (an
 * infrastructure Operation). The public API wraps this in ephemeral()
 * to return Workflow<Iterable<T>>.
 *
 * durableEach and durableEach.next share state through a module-level
 * variable (activeState). This is safe because durable execution is
 * single-threaded — only one coroutine runs at a time. This avoids
 * Effection context, which doesn't work when both functions are
 * individually wrapped in ephemeral() (each would get its own child
 * scope, making context invisible across them).
 */
function* _durableEachOp<T extends Json>(
  name: string,
  source: DurableSource<T>,
): Operation<Iterable<T>> {
  // Guard against nested durableEach — the single module-level slot
  // would clobber the outer iteration's state.
  if (activeState !== null) {
    throw new Error(
      `durableEach("${name}"): cannot nest durableEach calls in the same scope. Use a child scope (e.g., via spawn) for inner iterations.`,
    );
  }

  // Register source teardown on scope exit — ensures cleanup even if
  // the for...of loop breaks or the scope is cancelled without an
  // active effect. Safe to call alongside effect-level teardown
  // because DurableSource.close() must be idempotent.
  yield* ensure(() => {
    source.close?.();
  });

  // Durable fetch of first item — journaled as a Yield event.
  // ensure() is already registered, so cancellation here is safe.
  const first: ItemOrDone<T> = yield* durableEachFetch(name, source);

  // Store state in module-level slot for durableEach.next() to access.
  // Cleared when the iteration completes (done or break).
  const state: DurableEachState<T> = {
    name,
    source,
    current: first,
    advanced: true, // first item was just fetched
  };
  activeState = state as DurableEachState<Json>;

  // Return a synchronous iterable. The iterator generator checks
  // the shared state on each re-entry. The try/finally ensures
  // source.close() is called when the loop exits — whether by
  // exhaustion (DONE), break, or throw. This provides immediate
  // cleanup without waiting for scope teardown (ensure() is still
  // registered as a safety net for cancellation during fetch).
  return {
    *[Symbol.iterator]() {
      try {
        while (!isDone(state.current)) {
          // Advance guard: detect missing yield* durableEach.next()
          if (!state.advanced) {
            throw new Error(
              `durableEach("${name}"): yield* durableEach.next() must be called before the next iteration. Each loop body must end with yield* durableEach.next() to checkpoint progress and fetch the next item.`,
            );
          }
          state.advanced = false;
          yield state.current as T;
        }
      } finally {
        // Clear module-level state so a subsequent durableEach can run.
        activeState = null;
        source.close?.();
      }
    },
  };
}

/**
 * Durable iteration over a DurableSource.
 *
 * Returns Workflow<Iterable<T>> via ephemeral() — the infrastructure
 * effect (ensure) is durable-safe and re-runs correctly on replay.
 */
function _durableEach<T extends Json>(
  name: string,
  source: DurableSource<T>,
): Workflow<Iterable<T>> {
  return ephemeral(_durableEachOp(name, source));
}

// ---------------------------------------------------------------------------
// durableEach.next — static method to advance iteration
// ---------------------------------------------------------------------------

/**
 * Advance the current durable iteration.
 *
 * Reads state from the module-level activeState slot (set by durableEach).
 * This is a pure Workflow — no infrastructure effects, no ephemeral()
 * needed. The only yielded effect is durableEachFetch, which is already
 * a DurableEffect (journaled).
 */
function* _durableEachNext<T extends Json>(): Workflow<void> {
  if (activeState === null) {
    throw new Error(
      "durableEach.next(): no active durableEach iteration. " +
        "durableEach.next() must be called inside a durableEach loop.",
    );
  }
  const state = activeState as DurableEachState<T>;
  // Fetch next item first, then mark advanced. If the fetch throws
  // (source error), advanced stays false and re-entry triggers the
  // advance guard — preventing stale current from being re-yielded.
  state.current = yield* durableEachFetch<T>(state.name, state.source);
  state.advanced = true;
}

// ---------------------------------------------------------------------------
// Public API — durableEach with static .next() method
// ---------------------------------------------------------------------------

/**
 * Durable iteration over a DurableSource.
 *
 * Returns a Workflow that fetches the first item and yields a
 * synchronous iterable. Use with `for...of` inside a Workflow:
 *
 * ```typescript
 * for (let msg of yield* durableEach("queue", source)) {
 *   yield* durableCall("process", () => process(msg));
 *   yield* durableEach.next();
 * }
 * ```
 *
 * @param name Stable name for the iteration
 * @param source Operation-native source of items
 */
export const durableEach: {
  <T extends Json>(
    name: string,
    source: DurableSource<T>,
  ): Workflow<Iterable<T>>;
  next<T extends Json>(): Workflow<void>;
} = Object.assign(_durableEach, { next: _durableEachNext });
