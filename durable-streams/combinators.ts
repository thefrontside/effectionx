/**
 * Structured concurrency combinators for durable workflows.
 *
 * durableSpawn, durableAll, durableRace — each wraps child workflows
 * with DurableContext (coroutine IDs, Close events) so that structured
 * concurrency is fully journaled and replayable.
 *
 * Each combinator returns Workflow<T> (not Operation<T>) so it can be
 * used directly inside a Workflow via yield*. Internally, the infrastructure
 * effects (useScope, spawn, all, race) are wrapped with ephemeral() —
 * these are durable-safe operations that set up scope/context and don't
 * need journaling. See DEC-034.
 *
 * Child workflows must be Workflow<T> — bare Operations are rejected at
 * compile time. Use ephemeral() to explicitly opt in to non-durable
 * children.
 *
 * See protocol spec §7 (structured concurrency), §10 (race semantics).
 */

import {
  all as effectionAll,
  race as effectionRace,
  spawn,
  suspend,
  useScope,
} from "effection";
import type { Operation, Task } from "effection";
import { DurableCtx, type DurableContext } from "./context.ts";
import { ephemeral } from "./ephemeral.ts";
import { deserializeError, serializeError } from "./serialize.ts";
import type { Close, Json, Workflow } from "./types.ts";

// ---------------------------------------------------------------------------
// Internal: wrap a child workflow with DurableContext + Close emission
// ---------------------------------------------------------------------------

/**
 * Run a child workflow within a spawned scope, setting up its own
 * DurableContext and emitting a Close event when it terminates.
 *
 * This is the core building block for all structured concurrency combinators.
 *
 * It:
 *  1. Checks if the child already completed (has Close event) — short-circuits
 *  2. Sets DurableCtx on the child's scope with the child's coroutineId
 *  3. Runs the child workflow (its DurableEffects use the child's coroutineId)
 *  4. Appends Close(ok|err) when the child terminates
 *
 * IMPORTANT: This must be called inside a spawn() so it gets its own scope.
 * The caller is responsible for spawn().
 */
function* runDurableChild<T extends Json | void>(
  childWorkflow: () => Workflow<T>,
  childId: string,
  parentCtx: DurableContext,
): Operation<T> {
  const { replayIndex, stream } = parentCtx;

  // Short-circuit: child already completed in a previous run
  if (replayIndex.hasClose(childId)) {
    const closeEvent = replayIndex.getClose(childId)!;
    if (closeEvent.result.status === "ok") {
      return closeEvent.result.value as T;
    } else if (closeEvent.result.status === "err") {
      throw deserializeError(closeEvent.result.error);
    } else {
      // cancelled — this child was cancelled in a previous run (e.g.,
      // a race loser). Instead of throwing, we suspend forever. The
      // parent combinator (race/all) will cancel this child as part of
      // normal structured concurrency teardown, just like the original
      // run. The Close(cancelled) event already exists in the journal,
      // so we skip re-emitting it (the finally block checks for this).
      //
      // INVARIANT: This branch is only reachable when a parent combinator
      // (durableRace or durableAll with a failed sibling) will cancel this
      // child. Close(cancelled) in the journal means the child was
      // previously cancelled by structured concurrency, so on replay the
      // same combinator will cancel it again. This cannot deadlock.
      yield* suspend();
      // unreachable — suspend blocks until cancelled
      return undefined as T;
    }
  }

  // Set child's DurableContext on this scope
  const scope = yield* useScope();
  scope.set(DurableCtx, {
    replayIndex,
    stream,
    coroutineId: childId,
    childCounter: 0,
  });

  // Track whether we completed normally or via error, so that
  // the finally block can detect cancellation (the remaining case).
  let closeEvent: Close | undefined;

  try {
    // Run the child workflow. DurableEffects inside the child read
    // DurableCtx from the scope, so they'll use childId.
    const result: T = yield* childWorkflow();

    // Record Close(ok) — will be appended in finally
    closeEvent = {
      type: "close",
      coroutineId: childId,
      result: { status: "ok", value: result as Json },
    };

    return result;
  } catch (error) {
    // Record Close(err) — will be appended in finally
    closeEvent = {
      type: "close",
      coroutineId: childId,
      result: {
        status: "err",
        error: serializeError(
          error instanceof Error ? error : new Error(String(error)),
        ),
      },
    };

    throw error;
  } finally {
    // If closeEvent is still undefined, the generator was cancelled
    // (Effection called iterator.return(), skipping both the normal
    // return path and the catch block).
    if (!closeEvent) {
      closeEvent = {
        type: "close",
        coroutineId: childId,
        result: { status: "cancelled" },
      };
    }

    // Don't re-emit a Close event if one already exists in the journal
    // (e.g., a cancelled child being replayed via suspend()).
    if (!replayIndex.hasClose(childId)) {
      // Append the Close event.
      yield* stream.append(closeEvent!);
    }
  }
}

// ---------------------------------------------------------------------------
// durableSpawn — spawn a single durable child, returns Task<T>
// ---------------------------------------------------------------------------

/**
 * Spawn a durable child workflow.
 *
 * Assigns a deterministic coroutine ID (parentId.N), sets up DurableContext
 * on the child scope, and ensures Close events are emitted.
 *
 * Returns a Task<T> that can be yield*-ed to get the child's result.
 *
 * Returns Workflow<Task<T>> via ephemeral() — the infrastructure effects
 * (useScope, spawn) are durable-safe scope setup that doesn't need
 * journaling and re-runs correctly on replay.
 */
export function durableSpawn<T extends Json | void>(
  childWorkflow: () => Workflow<T>,
): Workflow<Task<T>> {
  return ephemeral(function* (): Operation<Task<T>> {
    const scope = yield* useScope();
    const ctx = scope.expect<DurableContext>(DurableCtx);

    // Assign deterministic child ID
    const childIndex = ctx.childCounter++;
    const childId = `${ctx.coroutineId}.${childIndex}`;

    // Spawn the child with durable wrapping
    return yield* spawn(() => runDurableChild(childWorkflow, childId, ctx));
  }());
}

// ---------------------------------------------------------------------------
// durableAll — fork/join, wait for all children
// ---------------------------------------------------------------------------

/**
 * Run multiple durable workflows concurrently and wait for all to complete.
 *
 * Each child gets a deterministic coroutine ID (parentId.0, parentId.1, ...).
 * Each child's effects are journaled under its own coroutineId.
 * Each child emits a Close event on termination.
 *
 * If any child fails, remaining children are cancelled (fail-fast,
 * Effection's default structured concurrency behavior via all()).
 *
 * Returns an array of results in the same order as the input workflows.
 *
 * See spec §7, §11.5.
 */
export function durableAll<T extends Json | void>(
  workflows: (() => Workflow<T>)[],
): Workflow<T[]> {
  return ephemeral(function* (): Operation<T[]> {
    const scope = yield* useScope();
    const ctx = scope.expect<DurableContext>(DurableCtx);

    // Build child Operations, one per workflow. Each gets its own
    // deterministic coroutineId and Close event handling.
    const childOps: Operation<T>[] = workflows.map((workflow) => {
      const childIndex = ctx.childCounter++;
      const childId = `${ctx.coroutineId}.${childIndex}`;

      return {
        *[Symbol.iterator]() {
          return yield* runDurableChild(workflow, childId, ctx);
        },
      };
    });

    // Delegate to Effection's native all() which uses trap() internally
    // for proper error isolation. This means:
    // - Child errors are catchable by the caller via try/catch
    // - When any child fails, remaining siblings are cancelled
    // - The error propagates with the original message intact
    return yield* effectionAll(childOps);
  }());
}

// ---------------------------------------------------------------------------
// durableRace — first child to complete wins, others cancelled
// ---------------------------------------------------------------------------

/**
 * Race multiple durable workflows. The first to complete wins;
 * remaining children are cancelled.
 *
 * Each child gets a deterministic coroutine ID. When the winner
 * completes, Effection cancels the remaining children via
 * iterator.return(). The runDurableChild wrapper detects this
 * (closeEvent is undefined in the finally block) and emits
 * Close(cancelled) for each loser.
 *
 * On replay, children with Close(cancelled) in the journal suspend
 * indefinitely (yield* suspend()), letting the parent race cancel
 * them naturally — matching the original live behavior.
 *
 * See spec §10.
 */
export function durableRace<T extends Json | void>(
  workflows: (() => Workflow<T>)[],
): Workflow<T> {
  return ephemeral(function* (): Operation<T> {
    const scope = yield* useScope();
    const ctx = scope.expect<DurableContext>(DurableCtx);

    // Build Operations for each child — each gets its own coroutineId
    // and Close event handling via runDurableChild.
    const childOps: Operation<T>[] = workflows.map((workflow) => {
      const childIndex = ctx.childCounter++;
      const childId = `${ctx.coroutineId}.${childIndex}`;

      return {
        *[Symbol.iterator]() {
          return yield* runDurableChild(workflow, childId, ctx);
        },
      };
    });

    // Use Effection's native race() which handles cancellation properly
    return yield* effectionRace(childOps);
  }());
}
