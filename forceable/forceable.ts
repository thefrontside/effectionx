import {
  type Operation,
  ensure,
  resource,
  scoped,
  spawn,
  suspend,
  withResolvers,
} from "effection";

/**
 * Abandon a resource's graceful teardown and tear it down immediately.
 *
 * A resource implements this when it can be shut down two ways: cooperatively,
 * by asking and waiting, and forcibly, by seizing whatever the operating system
 * gave it. Cooperative shutdown is always attempted first and is often the only
 * one that runs.
 */
export const force = Symbol.for("effection.force");

/**
 * Reported to whoever is waiting on a resource that was torn down forcibly.
 * Its graceful teardown never ran, so anything that teardown was responsible
 * for is still outstanding.
 */
export class ForcedTerminationError extends Error {
  override name = "ForcedTerminationError";

  constructor(reason?: string) {
    super(reason ?? "torn down forcibly");
  }
}

/** A resource whose graceful teardown can be abandoned. */
export interface Forceable {
  /**
   * Tear down immediately. Safe to call more than once and safe to call on a
   * resource that already finished — later calls do nothing.
   *
   * @param reason why the graceful teardown was abandoned, for the error the
   * resource reports to whoever is waiting on it
   */
  [force](reason?: string): void;
}

/**
 * A policy decides when graceful teardown has gone on long enough. It begins
 * when teardown begins and runs alongside it, so it can read application state
 * as the shutdown actually unfolds. Calling `force` abandons the graceful
 * teardown; returning without calling it waits however long that takes.
 *
 * If the resource tears down gracefully first, the policy is cancelled wherever
 * it happens to be suspended.
 */
export type ForcePolicy = (force: (reason?: string) => void) => Operation<void>;

/**
 * Give a resource a deadline, so a graceful teardown that never lands cannot
 * hold its scope open forever.
 *
 * The resource keeps its own graceful teardown and runs it exactly as it would
 * have. `policy` runs concurrently with that teardown and may cut it short.
 *
 * @example Give a stubborn resource ten seconds, then take it down
 * ```ts
 * import { sleep } from "effection";
 * import { withForce } from "@effectionx/forceable";
 *
 * let connection = yield* withForce(useConnection(url), function* (force) {
 *   yield* sleep(10_000);
 *   force("connection did not drain within 10s");
 * });
 * ```
 *
 * @example Decide from application state rather than a clock
 * ```ts
 * let connection = yield* withForce(useConnection(url), function* (force) {
 *   let health = yield* Health.expect();
 *   yield* health.unresponsive;
 *   force("stopped answering health checks");
 * });
 * ```
 *
 * @param op operation acquiring the resource to put a deadline on
 * @param policy decides when to abandon the graceful teardown
 */
export function withForce<T extends Forceable>(
  op: Operation<T>,
  policy: ForcePolicy,
): Operation<T> {
  return resource(function* (provide) {
    let acquired = withResolvers<T>();

    // Hold the resource open in a child task so that halting the task, rather
    // than exiting this frame, is what starts its graceful teardown. That gives
    // the policy below something to run alongside.
    let held = yield* spawn(function* () {
      acquired.resolve(yield* op);
      yield* suspend();
    });

    let value = yield* acquired.operation;

    yield* ensure(function* () {
      yield* scoped(function* () {
        yield* spawn(() => policy((reason) => value[force](reason)));
        yield* held.halt();
      });
    });

    yield* provide(value);
  });
}
