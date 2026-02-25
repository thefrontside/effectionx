import type { Operation, Task } from "effection";
import { createScope, global } from "effection";
import { ReducerContext } from "effection/experimental";
import type { DurableStream } from "./types.ts";
import { DurableReducer, toJson } from "./durable-reducer.ts";
import { InMemoryDurableStream } from "./stream.ts";

/**
 * Options for configuring a durable execution.
 */
export interface DurablyOptions {
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
 * `durably` wraps an Effection operation so that every effect resolution
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
 * import { durably, InMemoryDurableStream } from "@effectionx/durably";
 * import { sleep } from "effection";
 *
 * let stream = new InMemoryDurableStream();
 *
 * await durably(function*() {
 *   yield* sleep(1000);
 *   return "hello";
 * }, { stream });
 * ```
 *
 * @param operation - the operation to run durably
 * @param options - optional configuration including a DurableStream
 * @returns a task representing the running operation
 */
export function durably<T>(
  operation: () => Operation<T>,
  options?: DurablyOptions,
): Task<T> {
  let stream = options?.stream ?? new InMemoryDurableStream();
  let reducer = new DurableReducer(stream);

  // Create a child scope from global and inject our DurableReducer.
  // All coroutines created within this scope (and its children) will
  // use our reducer instead of the default one.
  let [scope] = createScope(global);
  scope.set(ReducerContext, reducer);

  // Install scope lifecycle middleware to record/replay scope events.
  // This must be done before any operations run so all scope creation/
  // destruction flows through the durable middleware.
  reducer.installScopeMiddleware(scope);

  let task = scope.run(operation);

  // Eagerly attach a settlement handler to record root scope lifecycle
  // events. This fires regardless of whether the consumer uses `await`
  // (Promise .then) or `yield*` (generator/Operation protocol).
  //
  // The root scope is created/destroyed outside the scope tree managed
  // by the middleware, so we record its destruction when the task settles.
  task.then(
    (value: T) => {
      reducer.emitWorkflowReturn(scope, "root", value);
      if (reducer.isReplayingRoot()) {
        reducer.consumeRootDestroyed();
      } else {
        stream.append({
          type: "scope:destroyed",
          scopeId: "root",
          result: { ok: true },
        });
      }
    },
    (error: unknown) => {
      if (reducer.isReplayingRoot()) {
        reducer.consumeRootDestroyed();
      } else {
        let err = error as Error;
        stream.append({
          type: "scope:destroyed",
          scopeId: "root",
          result: {
            ok: false,
            error: {
              name: err.name,
              message: err.message,
              stack: err.stack,
            },
          },
        });
      }
    },
  );

  return task;
}
