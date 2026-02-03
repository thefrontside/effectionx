import { box } from "@effectionx/result";
import {
  type Operation,
  type Result,
  type Scope,
  type Stream,
  createChannel,
  spawn,
  useScope,
  withResolvers,
} from "effection";

/**
 * An isolated scope that can evaluate operations and expose their side effects.
 *
 * This is useful for testing scenarios where you need to:
 * - Evaluate operations in a separate scope
 * - Access context values set by those operations
 * - Inspect the scope's state from outside
 */
export interface EvalScope {
  /**
   * The underlying Effection scope.
   * Use this to inspect context values set by evaluated operations.
   */
  scope: Scope;

  /**
   * Evaluate an operation within this scope.
   *
   * The operation runs in the spawned scope, so any context values it sets
   * will be visible via `scope.get(context)`.
   *
   * @param op - A function returning the operation to evaluate
   * @returns The result of the operation (Ok or Err)
   */
  eval<T>(op: () => Operation<T>): Operation<Result<T>>;
}

interface CallEval {
  operation: () => Operation<unknown>;
  resolve: (result: Result<unknown>) => void;
}

/**
 * Create an isolated scope for evaluating operations.
 *
 * This spawns a child scope that processes operations sent to it via a channel.
 * The key benefit is that you can access the scope object directly, allowing
 * you to inspect context values that were set by evaluated operations.
 *
 * @returns An EvalScope with access to the scope and an eval function
 *
 * @example
 * ```ts
 * import { createContext } from "effection";
 * import { useEvalScope } from "@effectionx/scope-eval";
 *
 * const context = createContext<string>("my-context");
 *
 * const evalScope = yield* useEvalScope();
 *
 * // Context not set yet
 * evalScope.scope.get(context); // => undefined
 *
 * // Evaluate an operation that sets context
 * yield* evalScope.eval(function*() {
 *   yield* context.set("Hello World!");
 * });
 *
 * // Now the context is visible
 * evalScope.scope.get(context); // => "Hello World!"
 * ```
 */
export function* useEvalScope(): Operation<EvalScope> {
  const scopeResolver = withResolvers<Scope>();
  const readyResolver = withResolvers<void>();
  const operations = createChannel<CallEval, never>();

  yield* spawn(function* () {
    scopeResolver.resolve(yield* useScope());

    // Get subscription to the channel
    const subscription = yield* operations as Stream<CallEval, never>;

    // Signal that we're ready to receive
    readyResolver.resolve();

    // Process operations as they come in
    while (true) {
      const next = yield* subscription.next();
      if (next.done) {
        break;
      }
      const call = next.value;
      const result = yield* box(call.operation);
      call.resolve(result);
    }
  });

  // Wait for the scope to be available
  const scope = yield* scopeResolver.operation;

  // Wait for the spawned task to be ready to receive
  yield* readyResolver.operation;

  return {
    scope,
    *eval<T>(operation: () => Operation<T>): Operation<Result<T>> {
      const resolver = withResolvers<Result<T>>();
      yield* operations.send({
        resolve: resolver.resolve as (result: Result<unknown>) => void,
        operation: operation as () => Operation<unknown>,
      });
      return yield* resolver.operation;
    },
  };
}
