import type { Operation } from "effection";
import { scoped, spawn, useScope } from "effection";
import { api, type Instruction } from "effection/experimental";
import type { DurableStream } from "./types.ts";
import { DurableReducer } from "./durable-reducer.ts";
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
 * Returns an `Operation<T>` that must be yielded. The durable scope is
 * a structured child of the caller's scope, so cancellation propagates
 * correctly. If you need a haltable task handle, spawn it:
 * `yield* spawn(() => durably(op, opts))`.
 *
 * @example
 * ```typescript
 * import { main, sleep } from "effection";
 * import { durably, InMemoryDurableStream } from "@effectionx/durably";
 *
 * let stream = new InMemoryDurableStream();
 *
 * await main(function*() {
 *   let result = yield* durably(function*() {
 *     yield* sleep(1000);
 *     return "hello";
 *   }, { stream });
 * });
 * ```
 *
 * @param operation - the operation to run durably
 * @param options - optional configuration including a DurableStream
 * @returns an operation that yields the result of the inner operation
 */
export function durably<T>(
  operation: () => Operation<T>,
  options?: DurablyOptions,
): Operation<T> {
  return scoped(function* () {
    let stream = options?.stream ?? new InMemoryDurableStream();
    let reducer = new DurableReducer(stream);
    let apis = api as typeof api & { Reducer: unknown; Scope: unknown };

    let scope = yield* useScope();

    scope.around(apis.Reducer as never, {
      reduce([instruction]: [Instruction]) {
        reducer.reduce(instruction);
      },
    } as never);

    scope.around(apis.Scope as never, reducer.createScopeMiddleware(scope) as never, {
      at: "max",
    });

    // The user's operation must run in a spawned task — not via
    // generator delegation (yield* operation()). scoped() reuses the
    // parent coroutine: it swaps routine.scope but doesn't create a
    // new coroutine. With generator delegation, the parent's reducer
    // steps through the inner effects in a single reduce cycle, so
    // api.Reducer middleware on the child scope never intercepts
    // effect entry. Only a new coroutine (created by spawn) routes
    // every reduce step — including effect entry — through
    // api.Reducer on this scope, allowing the DurableReducer to
    // decide whether to call effect.enter() or replay from the stream.
    let task = yield* spawn(operation);
    return yield* task;
  });
}
