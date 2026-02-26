import type { Operation, Task } from "effection";
import { createScope, global } from "effection";
import { ReducerContext } from "effection/experimental";
import { DurableReducer } from "./reducer.ts";
import { InMemoryDurableStream } from "./stream.ts";
import type { DurableStream } from "./types.ts";
import { type DurableOperation, asDurable } from "./types.ts";

/**
 * Options for configuring a durable execution.
 */
export interface DurableOptions {
  /**
   * A durable stream to record/replay effect resolutions.
   * When provided, the stream is used for persistence.
   * When omitted, an ephemeral in-memory stream is used
   * (all effects still go through the durable reducer,
   * but nothing is persisted between runs).
   */
  stream?: DurableStream;
}

/**
 * Execute an operation with durable execution semantics.
 *
 * `durable` wraps an Effection operation so that every effect resolution
 * is recorded to a {@link DurableStream}. When a stream with existing
 * events is provided, stored results are replayed without re-executing
 * effects, enabling mid-workflow resume after restarts.
 *
 * This is analogous to Effection's `run()` but with recording and
 * replay built in. By default, an ephemeral in-memory stream is used.
 * Pass a persistent stream via `options.stream` to enable durable
 * execution that survives restarts.
 *
 * @example
 * ```typescript
 * import { durable, InMemoryDurableStream } from "@effectionx/durable";
 *
 * let stream = new InMemoryDurableStream();
 *
 * await durable(function*() {
 *   yield* sleep(1000);
 *   return "hello";
 * }, { stream });
 * ```
 *
 * @param operation - the operation to run durably
 * @param options - optional configuration including a DurableStream
 * @returns a task representing the running operation
 */
export function durable<T>(
  operation: () => DurableOperation<T>,
  options?: DurableOptions,
): Task<T> {
  let stream = options?.stream ?? new InMemoryDurableStream();
  let reducer = new DurableReducer(stream);

  let [scope] = createScope(global);
  scope.set(ReducerContext, reducer);

  reducer.installScopeMiddleware(scope);

  // The operation returns a DurableOperation<T> which is structurally
  // an Operation<T>, so scope.run() accepts it transparently.
  return scope.run(operation as () => Operation<T>);
}
