import assert from "node:assert";
import { MessagePort, parentPort } from "node:worker_threads";
import type { ValueSignal } from "@effectionx/signals";
import {
  createChannel,
  createSignal,
  each,
  Err,
  Ok,
  type Operation,
  type Task,
  main,
  on,
  resource,
  spawn,
} from "effection";

import type { WorkerControl, WorkerMainOptions } from "./types.ts";
import { errorFromSerialized } from "./types.ts";
import { useChannelResponse, useChannelRequest } from "./channel.ts";

// Get the appropriate worker port for the current environment as a resource
function useWorkerPort(): Operation<MessagePort> {
  return resource(function* (provide) {
    const port = parentPort
      ? parentPort // Node.js worker_threads
      : (self as unknown as MessagePort); // Browser/Deno Web Worker

    try {
      yield* provide(port);
    } finally {
      port.close();
    }
  });
}

/**
 * Entrypoint used in the worker that estaliblishes communication
 * with the main thread. It can be used to return a value,
 * respond to messages or both.
 *
 * @example Returning a value
 * ```ts
 * import { workerMain } from "../worker.ts";
 *
 * await workerMain(function* ({ data }) {
 *  return data;
 * });
 * ```
 *
 * @example Responding to messages
 * ```ts
 * import { workerMain } from "../worker.ts";
 *
 * await workerMain(function* ({ messages }) {
 *  yield* messages.forEach(function* (message) {
 *    return message;
 *  });
 * });
 * ```
 *
 * @example Responding to messages and return a value
 * ```ts
 * import { workerMain } from "../worker.ts";
 *
 * await workerMain<number, number, number, number>(
 *   function* ({ messages, data: initial }) {
 *     let counter = initial;
 *
 *     yield* messages.forEach(function* (message) {
 *       counter += message;
 *       return counter; // returns a value after each message
 *     });
 *
 *     return counter; // returns the final value
 *   },
 * );
 * ```
 *
 * @example Sending requests to the host
 * ```ts
 * import { workerMain } from "../worker.ts";
 *
 * await workerMain<never, never, string, void, string, string>(
 *   function* ({ send }) {
 *     const response = yield* send("hello");
 *     return `received: ${response}`;
 *   },
 * );
 * ```
 *
 * @template TSend - value main thread will send to the worker
 * @template TRecv - value main thread will receive from the worker
 * @template TReturn - worker operation return value
 * @template TData - data passed from the main thread to the worker during initialization
 * @template WRequest - value worker sends to the host in requests
 * @template WResponse - value worker receives from the host (response to worker's send)
 * @param {(options: WorkerMainOptions<TSend, TRecv, TData, WRequest, WResponse>) => Operation<TReturn>} body
 * @returns {Promise<void>}
 */
export async function workerMain<
  TSend,
  TRecv,
  TReturn,
  TData,
  WRequest = never,
  WResponse = never,
>(
  body: (
    options: WorkerMainOptions<TSend, TRecv, TData, WRequest, WResponse>,
  ) => Operation<TReturn>,
): Promise<void> {
  await main(function* () {
    const port = yield* useWorkerPort();
    let sent = createChannel<{ value: TSend; response: MessagePort }>();
    let worker = yield* createWorkerStatesSignal();

    yield* spawn(function* () {
      for (const message of yield* each(on(port, "message"))) {
        const control: WorkerControl<TSend, TData> = (message as MessageEvent)
          .data;
        switch (control.type) {
          case "init": {
            worker.start(
              yield* spawn(function* () {
                try {
                  // Create send function for worker-initiated requests
                  function* send(requestValue: WRequest): Operation<WResponse> {
                    const response = yield* useChannelResponse<WResponse>();
                    port.postMessage(
                      {
                        type: "request",
                        value: requestValue,
                        response: response.port,
                      },
                      // biome-ignore lint/suspicious/noExplicitAny: cross-env MessagePort compatibility
                      [response.port] as any,
                    );
                    const result = yield* response;
                    if (result.ok) {
                      return result.value;
                    }
                    throw errorFromSerialized(
                      "Host handler failed",
                      result.error,
                    );
                  }

                  let value = yield* body({
                    data: control.data,
                    messages: {
                      *forEach(fn: (value: TSend) => Operation<TRecv>) {
                        for (let { value, response } of yield* each(sent)) {
                          yield* spawn(function* () {
                            const { resolve, reject } =
                              yield* useChannelRequest<TRecv>(
                                response as unknown as globalThis.MessagePort,
                              );
                            try {
                              let result = yield* fn(value);
                              yield* resolve(result);
                            } catch (error) {
                              yield* reject(error as Error);
                            }
                          });
                          yield* each.next();
                        }
                      },
                    },
                    send,
                  });

                  worker.complete(value);
                } catch (error) {
                  worker.crash(error as Error);
                }
              }),
            );
            break;
          }
          case "send": {
            let { value, response } = control;
            // Ensure that response is a proper MessagePort (DOM)
            assert(
              response instanceof MessagePort,
              "Expect response to be an instance of MessagePort",
            );
            yield* sent.send({ value, response });
            break;
          }
          case "close": {
            const current = worker.valueOf();
            if (current.type === "running") {
              yield* current.task.halt();
              worker.interrupt();
            }
          }
        }

        yield* each.next();
      }
    });

    for (const state of yield* each(worker)) {
      if (state.type === "new") {
        port.postMessage({ type: "open" });
      } else if (state.type === "interrupted" || state.type === "error") {
        port.postMessage({ type: "close", result: Err(state.error) });
        break;
      } else if (state.type === "complete") {
        port.postMessage({ type: "close", result: Ok(state.value) });
        break;
      }
      yield* each.next();
    }
  });
}

type New = { type: "new" };
type Running = { type: "running"; task: Task<void> };
type Complete = { type: "complete"; value: unknown };
type Errored = { type: "error"; error: Error };
type Interrupted = { type: "interrupted"; error: Error };

type WorkerState = New | Running | Complete | Errored | Interrupted;

interface WorkerStateSignal extends ValueSignal<WorkerState> {
  state: WorkerState["type"];
  start(task: Task<void>): Running | Complete;
  complete(value: unknown): Complete;
  crash(error: Error): Errored;
  interrupt(): Interrupted;
}

export function createWorkerStatesSignal(): Operation<WorkerStateSignal> {
  return resource(function* (provide) {
    let ref: { current: WorkerState } = {
      current: { type: "new" },
    };
    const signal = createSignal<WorkerState>();

    const set: WorkerStateSignal["set"] = (value) => {
      ref.current = value;
      signal.send(value);
      return value;
    };

    const update: WorkerStateSignal["update"] = (updater) =>
      set(updater(ref.current));

    const interrupt: WorkerStateSignal["interrupt"] = () => {
      let next: Interrupted = {
        type: "interrupted",
        error: new Error("worker terminated"),
      };
      set(next);
      return next;
    };

    try {
      yield* provide({
        *[Symbol.iterator]() {
          let subscription = yield* signal;
          signal.send(ref.current);
          return subscription;
        },
        get state() {
          return ref.current.type;
        },
        set,
        update,
        valueOf() {
          return ref.current;
        },
        start(task) {
          if (ref.current.type === "complete") {
            return ref.current;
          }
          const next: Running = { type: "running", task };
          set(next);
          return next;
        },
        complete(value) {
          let next: Complete = { type: "complete", value };
          set(next);
          return next;
        },
        crash(error) {
          let next: Errored = { type: "error", error };
          set(next);
          return next;
        },
        interrupt: interrupt,
      });
    } finally {
      if (ref.current.type === "running") {
        interrupt();
      }
    }
  });
}
