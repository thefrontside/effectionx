/**
 * ephemeral — explicit escape hatch for non-durable Operations inside Workflows.
 *
 * Wraps an Operation<T> so it satisfies the Workflow<T> type contract.
 * The wrapped operation is **transparent to the journal** — no Yield event
 * is written, no replay index entry is consumed. On replay, the operation
 * simply re-runs.
 *
 * This is analogous to Rust's `unsafe {}` — it marks the boundary where
 * the user is opting out of durable guarantees. Every non-durable
 * Operation that needs to participate in a Workflow must go through
 * ephemeral() to make the escape explicit and auditable.
 *
 * Usage:
 *   yield* durableAll([
 *     () => myDurableWorkflow(),              // Workflow<T> — journaled
 *     function*() {                            // Workflow<T> with ephemeral child
 *       return yield* ephemeral(someOperation());
 *     },
 *   ]);
 *
 * See DEC-034 for the design rationale.
 */

import type { Operation } from "effection";
import type {
  DurableEffect,
  EffectionResult,
  Resolve,
  Workflow,
} from "./types.ts";

/** Effection void-ok result, used for no-op teardowns. */
const VOID_OK: EffectionResult<void> = { ok: true, value: undefined as void };

/**
 * Create a DurableEffect that runs an Operation transparently.
 *
 * - No journal write (no Yield event appended)
 * - No replay index consumption (cursor not advanced)
 * - The Operation runs via scope.run() with full structured concurrency
 * - Cancellation of the scope cancels the inner Operation
 * - On replay, the Operation re-runs (not cached)
 *
 * The effect is invisible to the durable execution protocol — it exists
 * solely to satisfy the Workflow<T> type constraint.
 */
function createEphemeralEffect<T>(
  operation: Operation<T>,
): DurableEffect<T> {
  return {
    description: "ephemeral",
    effectDescription: { type: "ephemeral", name: "ephemeral" },

    enter(
      resolve: Resolve<EffectionResult<T>>,
      routine,
    ): (resolve: Resolve<EffectionResult<void>>) => void {
      // Run the operation in the routine's scope — full structured
      // concurrency, proper cancellation. No journal interaction.
      routine.scope.run(function* () {
        try {
          const value = yield* operation;
          resolve({ ok: true, value });
        } catch (e) {
          const error = e instanceof Error ? e : new Error(String(e));
          resolve({ ok: false, error });
        }
      });

      // No teardown needed — scope.run() ties the operation's lifecycle
      // to the routine's scope.
      return (exit) => exit(VOID_OK);
    },
  };
}

/**
 * Wrap a non-durable Operation so it can be used inside a Workflow.
 *
 * The operation is transparent to the durable execution protocol:
 * - No Yield event is written to the journal
 * - On replay, the operation re-runs (it is not cached)
 * - Cancellation flows through normally via structured concurrency
 *
 * Use this when you need to run infrastructure Operations (or intentionally
 * non-durable work) inside a Workflow where only DurableEffects are allowed.
 *
 * @param operation The Operation to wrap
 * @returns A Workflow that yields the operation's result
 */
export function* ephemeral<T>(operation: Operation<T>): Workflow<T> {
  return (yield createEphemeralEffect(operation)) as T;
}
