import { Context, Effect, Layer } from "effect";
import type { UnknownException } from "effect/Cause";
import { type Operation, type Scope, createScope } from "effection";

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
 * @param parent - Optional parent Effection scope. If provided, the runtime's
 *                 scope will inherit all contexts from the parent scope.
 * @returns An Effect Layer providing EffectionRuntime
 *
 * @example Basic usage
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
 *
 * @example With parent scope (to inherit Effection contexts)
 * ```ts
 * import { Effect } from "effect";
 * import { useScope } from "effection";
 * import { makeEffectionRuntime, EffectionRuntime } from "@effectionx/effect";
 *
 * function* myOperation() {
 *   const scope = yield* useScope();
 *   const result = yield* call(() =>
 *     Effect.runPromise(
 *       Effect.gen(function* () {
 *         const runtime = yield* EffectionRuntime;
 *         return yield* runtime.run(function* () {
 *           // Can access Effection contexts from parent scope
 *           return "hello";
 *         });
 *       }).pipe(Effect.provide(makeEffectionRuntime(scope)), Effect.scoped)
 *     )
 *   );
 *   return result;
 * }
 * ```
 */
export function makeEffectionRuntime(
  parent?: Scope,
): Layer.Layer<EffectionRuntime> {
  return Layer.scoped(
    EffectionRuntime,
    Effect.gen(function* () {
      const [scope, close] = createScope(parent);

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
