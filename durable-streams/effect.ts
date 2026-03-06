/**
 * createDurableEffect / createDurableOperation — core factories for durable effects.
 *
 * Each DurableEffect handles its own replay/live dispatch inside enter().
 * It reads DurableContext from the scope, checks the replay index, and
 * either feeds the stored result (replay) or executes live with
 * persist-before-resume semantics.
 *
 * Two factories are provided:
 * - createDurableEffect: callback-based executor (resolve/reject/teardown)
 *   for timer-like and callback-based APIs (durableSleep, durableAction).
 * - createDurableOperation: Operation-based executor for structured
 *   concurrency. The live path runs entirely as a generator — execute,
 *   capture result, persist, resolve. No callbacks, no .then().
 *
 * Divergence policy is delegated to the Divergence API (DEC-031).
 * By default, mismatches are fatal. Users can install middleware via
 * scope.around(Divergence, ...) to override behavior per-scope.
 *
 * See integration doc §5.1, protocol spec §4.2, §5, §6.
 */

import type { Operation } from "effection";
import { DurableCtx, type DurableContext } from "./context.ts";
import { Divergence } from "./divergence.ts";
import { StaleInputError } from "./errors.ts";
import { ReplayGuard } from "./replay-guard.ts";
import { protocolToEffection, serializeError } from "./serialize.ts";
import type {
  CoroutineView,
  DurableEffect,
  EffectDescription,
  EffectionResult,
  Json,
  Resolve,
  Result,
  Yield,
} from "./types.ts";

/** Effection void-ok result, used for no-op teardowns. */
const VOID_OK: EffectionResult<void> = {
  ok: true,
  value: undefined as undefined,
};

/**
 * Executor function signature for live execution (callback-based).
 *
 * The executor receives:
 * - resolve: call with a protocol Result when the effect completes
 * - reject: call with an Error for unexpected failures
 *
 * Returns a teardown function called during scope destruction/cancellation.
 */
export type Executor = (
  resolve: (result: Result) => void,
  reject: (error: Error) => void,
) => () => void;

// ---------------------------------------------------------------------------
// Shared replay path
// ---------------------------------------------------------------------------

/**
 * Result of the replay check: either the effect was replayed (and enter()
 * should return immediately) or the live path should execute.
 */
type ReplayResult<T> =
  | {
      path: "replayed";
      teardown: (resolve: Resolve<EffectionResult<void>>) => void;
    }
  | { path: "live" };

/**
 * Shared replay logic for both createDurableEffect and createDurableOperation.
 *
 * Checks the replay index for a matching entry, runs divergence detection,
 * and runs replay guards. If replay succeeds, resolves the generator
 * synchronously and returns "replayed". Otherwise returns "live" to
 * indicate the caller should execute the effect.
 */
function checkReplay<T>(
  desc: EffectDescription,
  resolve: Resolve<EffectionResult<T>>,
  routine: CoroutineView,
  ctx: DurableContext,
): ReplayResult<T> {
  const entry = ctx.replayIndex.peekYield(ctx.coroutineId);

  // ── REPLAY PATH ──
  // Use a labeled block so that divergence decisions of type "run-live"
  // can break out to fall through to the live execution path.
  // biome-ignore lint/suspicious/noConfusingLabels: deliberate labeled block for break-out-of-replay pattern
  replay: {
    if (entry) {
      // §6.2: Validate description match
      if (
        entry.description.type !== desc.type ||
        entry.description.name !== desc.name
      ) {
        // Delegate divergence policy to the Divergence API.
        const cursor = ctx.replayIndex.getCursor(ctx.coroutineId);
        const decision = Divergence.invoke(routine.scope, "decide", [
          {
            kind: "description-mismatch",
            coroutineId: ctx.coroutineId,
            cursor,
            expected: entry.description,
            actual: desc,
          },
        ]);

        if (decision.type === "throw") {
          resolve({ ok: false, error: decision.error });
          return { path: "replayed", teardown: (exit) => exit(VOID_OK) };
        }

        // decision.type === "run-live"
        ctx.replayIndex.disableReplay(ctx.coroutineId);
        break replay;
      }

      // Description matches — now check replay guards before replaying.
      // ── REPLAY GUARD: Decide phase ──
      const yieldEvent: Yield = {
        type: "yield",
        coroutineId: ctx.coroutineId,
        description: entry.description,
        result: entry.result,
      };
      const outcome = ReplayGuard.invoke(routine.scope, "decide", [yieldEvent]);

      if (outcome.outcome === "error") {
        ctx.replayIndex.consumeYield(ctx.coroutineId);
        const error =
          outcome.error ??
          new StaleInputError(
            `Stale input detected for ${desc.type}("${desc.name}")`,
            { coroutineId: ctx.coroutineId, description: desc },
          );
        resolve({ ok: false, error });
        return { path: "replayed", teardown: (exit) => exit(VOID_OK) };
      }

      // All guards approved — consume the entry and advance cursor
      ctx.replayIndex.consumeYield(ctx.coroutineId);

      // Feed stored result synchronously
      resolve(protocolToEffection<T>(entry.result));
      return { path: "replayed", teardown: (exit) => exit(VOID_OK) };
    }

    // No replay entry. Check for continue-past-close divergence (§6.3).
    if (ctx.replayIndex.hasClose(ctx.coroutineId)) {
      const yieldCount = ctx.replayIndex.yieldCount(ctx.coroutineId);
      const decision = Divergence.invoke(routine.scope, "decide", [
        {
          kind: "continue-past-close",
          coroutineId: ctx.coroutineId,
          yieldCount,
        },
      ]);

      if (decision.type === "throw") {
        resolve({ ok: false, error: decision.error });
        return { path: "replayed", teardown: (exit) => exit(VOID_OK) };
      }

      // decision.type === "run-live"
      ctx.replayIndex.disableReplay(ctx.coroutineId);
      break replay;
    }
  } // end replay block

  return { path: "live" };
}

// ---------------------------------------------------------------------------
// createDurableEffect — callback-based (Executor pattern)
// ---------------------------------------------------------------------------

/**
 * Creates a DurableEffect using a callback-based executor.
 *
 * Use this for timer-like and callback-based APIs (durableSleep, durableAction)
 * where the resolve/reject/teardown pattern is natural.
 *
 * For Operation-based effects, prefer createDurableOperation.
 *
 * @param desc Structured description for the journal and divergence detection
 * @param execute Called only during live execution (skipped during replay)
 */
export function createDurableEffect<T>(
  desc: EffectDescription,
  execute: Executor,
): DurableEffect<T> {
  return {
    description: `${desc.type}(${desc.name})`,
    effectDescription: desc,

    enter(
      resolve: Resolve<EffectionResult<T>>,
      routine,
    ): (resolve: Resolve<EffectionResult<void>>) => void {
      const ctx = routine.scope.expect<DurableContext>(DurableCtx);
      const replay = checkReplay<T>(desc, resolve, routine, ctx);
      if (replay.path === "replayed") return replay.teardown;

      // ── LIVE PATH ──

      /** Persist a Yield event then resume the generator. */
      function persistAndResolve(result: Result): void {
        const event: Yield = {
          type: "yield",
          coroutineId: ctx.coroutineId,
          description: desc,
          result,
        };
        // Uses scope.run() to call the Operation-returning stream.append()
        // from inside the callback-based enter(). The append runs as a
        // structured operation in the routine's scope — if the scope tears
        // down, the append is cancelled.
        routine.scope.run(function* () {
          try {
            yield* ctx.stream.append(event);
            resolve(protocolToEffection<T>(result));
          } catch (err) {
            resolve({
              ok: false,
              error: err instanceof Error ? err : new Error(String(err)),
            });
          }
        });
      }

      // Guard against synchronous throws from the executor.
      let teardown: () => void;
      try {
        teardown = execute(
          (result: Result) => persistAndResolve(result),
          (error: Error) => {
            persistAndResolve({
              status: "err",
              error: serializeError(error),
            });
          },
        );
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        persistAndResolve({
          status: "err",
          error: serializeError(error),
        });
        return (exit) => exit(VOID_OK);
      }

      // Return teardown that Effection calls during scope destruction
      return (exit: Resolve<EffectionResult<void>>) => {
        try {
          teardown();
          exit(VOID_OK);
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          exit({ ok: false, error });
        }
      };
    },
  };
}

// ---------------------------------------------------------------------------
// createDurableOperation — Operation-based (structured concurrency)
// ---------------------------------------------------------------------------

/**
 * Creates a DurableEffect from an Operation-returning function.
 *
 * The live path runs entirely as a generator inside scope.run():
 * execute the Operation, capture the result, persist the Yield event,
 * then resolve the generator. No callbacks, no .then(), full structured
 * concurrency — if the scope tears down, the operation is cancelled.
 *
 * Use this for durableCall and any effect where the work is expressed
 * as an Operation (or can be wrapped as one via Effection's call()).
 *
 * @param desc Structured description for the journal and divergence detection
 * @param execute Returns an Operation to run during live execution
 */
export function createDurableOperation<T extends Json>(
  desc: EffectDescription,
  execute: () => Operation<T>,
): DurableEffect<T> {
  return {
    description: `${desc.type}(${desc.name})`,
    effectDescription: desc,

    enter(
      resolve: Resolve<EffectionResult<T>>,
      routine,
    ): (resolve: Resolve<EffectionResult<void>>) => void {
      const ctx = routine.scope.expect<DurableContext>(DurableCtx);
      const replay = checkReplay<T>(desc, resolve, routine, ctx);
      if (replay.path === "replayed") return replay.teardown;

      // ── LIVE PATH ──
      // Run the entire execute → capture → persist → resolve sequence
      // as a structured operation in the routine's scope.
      routine.scope.run(function* () {
        let result: Result;
        try {
          const value = yield* execute();
          result = { status: "ok", value: value as Json };
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          result = { status: "err", error: serializeError(error) };
        }

        const event: Yield = {
          type: "yield",
          coroutineId: ctx.coroutineId,
          description: desc,
          result,
        };

        try {
          yield* ctx.stream.append(event);
          resolve(protocolToEffection<T>(result));
        } catch (err) {
          resolve({
            ok: false,
            error: err instanceof Error ? err : new Error(String(err)),
          });
        }
      });

      // No teardown needed — scope.run() ties the operation's lifecycle
      // to the routine's scope. Cancellation is handled by Effection.
      return (exit) => exit(VOID_OK);
    },
  };
}
