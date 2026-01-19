import { Context, Effect, Layer } from "effect";
import type { UnknownException } from "effect/Cause";
import { type Operation, createScope } from "effection";

/**
 * A runtime for executing Effection operations inside Effect programs.
 */
export interface EffectionRuntime {
  /**
   * Run an Effection operation and return its result as an Effect.
   *
   * Errors thrown in the operation become `UnknownException` in Effect.
   * The Effection scope is automatically cleaned up when the Effect completes
   * or is interrupted.
   *
   * @param operation - The Effection operation (generator function) to run
   * @returns An Effect that yields the operation's result
   *
   * @example
   * ```ts
   * const program = Effect.gen(function* () {
   *   const runtime = yield* EffectionRuntime;
   *   return yield* runtime.run(function* () {
   *     yield* sleep(100);
   *     return "hello";
   *   });
   * });
   * ```
   */
  run<T>(operation: () => Operation<T>): Effect.Effect<T, UnknownException>;
}

/**
 * Effect Context Tag for accessing the EffectionRuntime.
 *
 * @example
 * ```ts
 * const program = Effect.gen(function* () {
 *   const runtime = yield* EffectionRuntime;
 *   // use runtime.run(...)
 * });
 * ```
 */
export const EffectionRuntime =
  Context.GenericTag<EffectionRuntime>("EffectionRuntime");

/**
 * Create an Effect Layer that provides an EffectionRuntime.
 *
 * The Effection scope is automatically closed when the Effect scope ends,
 * ensuring proper cleanup of Effection resources.
 *
 * @returns An Effect Layer providing EffectionRuntime
 *
 * @example
 * ```ts
 * import { Effect } from "effect";
 * import { sleep } from "effection";
 * import { makeEffectionRuntime, EffectionRuntime } from "@effectionx/effect";
 *
 * const program = Effect.gen(function* () {
 *   const runtime = yield* EffectionRuntime;
 *   const result = yield* runtime.run(function* () {
 *     yield* sleep(100);
 *     return "hello from effection";
 *   });
 *   return result;
 * });
 *
 * await Effect.runPromise(
 *   program.pipe(
 *     Effect.provide(makeEffectionRuntime()),
 *     Effect.scoped
 *   )
 * );
 * ```
 */
export function makeEffectionRuntime(): Layer.Layer<EffectionRuntime> {
  return Layer.scoped(
    EffectionRuntime,
    Effect.gen(function* () {
      const [scope, close] = createScope();

      const run: EffectionRuntime["run"] = <T>(
        operation: () => Operation<T>,
      ) => {
        return Effect.tryPromise(() => scope.run(operation));
      };

      yield* Effect.addFinalizer(() =>
        Effect.gen(function* () {
          yield* Effect.tryPromise(() => close()).pipe(Effect.exit);
        }),
      );

      return { run };
    }),
  );
}
