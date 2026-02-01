import assert from "node:assert";
import {
  Err,
  Ok,
  on,
  once,
  type Operation,
  resource,
  type Result,
  type Scope,
  spawn,
  useScope,
  withResolvers,
} from "effection";
import Worker from "web-worker";

import { useMessageChannel } from "./message-channel.ts";
import {
  serializeError,
  errorFromSerialized,
  type SerializedError,
} from "./types.ts";

/**
 * Resource returned by useWorker, providing APIs for worker communication.
 *
 * @template TSend - value main thread will send to the worker
 * @template TRecv - value main thread will receive from the worker
 * @template TReturn - worker operation return value
 */
export interface WorkerResource<TSend, TRecv, TReturn>
  extends Operation<TReturn> {
  /**
   * Send a message to the worker and wait for a response.
   */
  send(data: TSend): Operation<TRecv>;
  /**
   * Handle requests initiated by the worker.
   * Only one forEach can be active at a time.
   *
   * @template WRequest - value worker sends to host
   * @template WResponse - value host sends back to worker
   */
  forEach<WRequest, WResponse>(
    fn: (request: WRequest) => Operation<WResponse>,
  ): Operation<TReturn>;
}

/**
 * Use on the main thread to create and exeecute a well behaved web worker.
 *
 * @example Compute a single value
 * ```ts
 * import { run } from "effection";
 * import { useWorker } from "@effectionx/worker"
 *
 * await run(function*() {
 *    const worker = yield* useWorker("script.ts", { type: "module" });
 *
 *    try {
 *      const result = yield* worker;
 *    } catch (e) {
 *      console.error(e);
 *    }
 * });
 * ```
 *
 * @example Compute multipe values
 * ```ts
 * import { run } from "effection";
 * import { useWorker } from "@effectionx/worker"
 *
 * await run(function*() {
 *    const worker = yield* useWorker("script.ts", { type: "module" });
 *
 *    try {
 *      const result1 = yield* worker.send("Tom");
 *      const result2 = yield* worker.send("Dick");
 *      const result2 = yield* worker.send("Harry");
 *
 *      // get the last result
 *      const finalResult = yield* worker;
 *    } catch (e) {
 *      console.error(e);
 *    }
 * });
 * ```
 *
 * @param url URL or string of script
 * @param options WorkerOptions
 * @template TSend - value main thread will send to the worker
 * @template TRecv - value main thread will receive from the worker
 * @template TReturn - worker operation return value
 * @template TData - data passed from the main thread to the worker during initialization
 * @returns {Operation<WorkerResource<TSend, TRecv>>}
 */
export function useWorker<TSend, TRecv, TReturn, TData>(
  url: string | URL,
  options?: WorkerOptions & { data?: TData },
): Operation<WorkerResource<TSend, TRecv, TReturn>> {
  return resource(function* (provide) {
    let outcome = withResolvers<TReturn>();

    let worker = new Worker(url, options);
    let subscription = yield* on(worker, "message");

    // Queue for requests that arrive before forEach is called
    const pendingRequests: Array<{ value: unknown; response: MessagePort }> =
      [];

    // Handler function set while forEach is active (null otherwise)
    let requestHandler:
      | ((msg: { value: unknown; response: MessagePort }) => void)
      | null = null;

    // Flag to prevent concurrent forEach calls
    let forEachInProgress = false;
    // Track if worker has closed
    let closed = false;

    // Capture scope to spawn handlers from onmessage callback
    const scope: Scope = yield* useScope();

    let onmessage = (event: MessageEvent) => {
      const msg = event.data;
      if (msg.type === "close") {
        closed = true;
        // Clear pending requests on close
        pendingRequests.length = 0;
        let { result } = msg as { result: Result<TReturn> };
        if (result.ok) {
          outcome.resolve(result.value);
        } else {
          // Wrap error with cause
          const serializedError = result.error as unknown as SerializedError;
          outcome.reject(errorFromSerialized("Worker failed", serializedError));
        }
      } else if (msg.type === "request") {
        const request = { value: msg.value, response: msg.response };
        if (requestHandler) {
          // Handler is active - dispatch immediately
          requestHandler(request);
        } else {
          // Queue for later when forEach is called
          pendingRequests.push(request);
        }
      }
    };

    worker.addEventListener("message", onmessage);

    let first = yield* subscription.next();

    assert(
      first.value.data.type === "open",
      `expected first message to arrive from worker to be of type "open", but was: ${first.value.data.type}`,
    );

    yield* spawn(function* () {
      let event = yield* once(worker, "error");
      event.preventDefault();
      throw event.error;
    });

    try {
      worker.postMessage({
        type: "init",
        data: options?.data,
      });

      yield* provide({
        *send(value) {
          let channel = yield* useMessageChannel();
          worker.postMessage(
            {
              type: "send",
              value,
              response: channel.port2,
            },
            [channel.port2],
          );
          channel.port1.start();
          let event = yield* once(channel.port1, "message");
          let result = (event as MessageEvent).data as Result<
            TRecv | SerializedError
          >;
          if (result.ok) {
            return result.value as TRecv;
          }
          // R2: wrap error with cause
          throw errorFromSerialized(
            "Worker handler failed",
            result.error as unknown as SerializedError,
          );
        },

        *forEach<WRequest, WResponse>(
          fn: (request: WRequest) => Operation<WResponse>,
        ): Operation<TReturn> {
          // Check closed FIRST, before setting flag
          if (closed) {
            return yield* outcome.operation;
          }

          // Prevent concurrent forEach
          if (forEachInProgress) {
            throw new Error("forEach is already in progress");
          }
          forEachInProgress = true;

          try {
            // Helper to handle a single request
            function* handleRequest(msg: {
              value: unknown;
              response: MessagePort;
            }): Operation<void> {
              try {
                const result = yield* fn(msg.value as WRequest);
                msg.response.postMessage(Ok(result));
              } catch (error) {
                msg.response.postMessage(
                  Err(serializeError(error as Error) as unknown as Error),
                );
              } finally {
                msg.response.close();
              }
            }

            // Set handler - requests will be dispatched via scope.run()
            requestHandler = (request) => {
              scope.run(function* () {
                yield* handleRequest(request);
              });
            };

            // Drain any requests that arrived before forEach was called
            for (const request of pendingRequests.splice(0)) {
              requestHandler(request);
            }

            // Wait for worker to close
            return yield* outcome.operation;
          } finally {
            requestHandler = null;
            forEachInProgress = false;
          }
        },

        [Symbol.iterator]: outcome.operation[Symbol.iterator],
      });
    } finally {
      worker.postMessage({ type: "close" });
      yield* settled(outcome.operation);
      worker.removeEventListener("message", onmessage);
    }
  });
}

function settled<T>(operation: Operation<T>): Operation<Result<void>> {
  return {
    *[Symbol.iterator]() {
      try {
        yield* operation;
        return Ok(void 0);
      } catch (error) {
        return Err(error as Error);
      }
    },
  };
}
