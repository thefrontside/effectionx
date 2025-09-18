import type { ValueSignal } from "@effectionx/signals";
import {
  createSignal,
  each,
  Err,
  main,
  Ok,
  on,
  type Operation,
  resource,
  spawn,
  type Task,
} from "effection";

import type { WorkerControl, WorkerMainOptions } from "./types.ts";

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
 * @template TSend - value main thread will send to the worker
 * @template TRecv - value main thread will receive from the worker
 * @template TReturn - worker operation return value
 * @template TData - data passed from the main thread to the worker during initialization
 * @param {(options: WorkerMainOptions<TSend, TRecv, TData>) => Operation<TReturn>} body
 * @returns {Promise<void>}
 */
export async function workerMain<TSend, TRecv, TReturn, TData>(
  body: (options: WorkerMainOptions<TSend, TRecv, TData>) => Operation<TReturn>,
): Promise<void> {
  await main(function* () {
    let sent = createSignal<{ value: TSend; response: MessagePort }>();
    let worker = yield* createWorkerStatesSignal();

    yield* spawn(function* () {
      for (const message of yield* each(on(self, "message"))) {
        const control: WorkerControl<TSend, TData> = message.data;
        switch (control.type) {
          case "init": {
            worker.start(
              yield* spawn(function* () {
                try {
                  let value = yield* body({
                    data: control.data,
                    messages: {
                      *forEach(fn: (value: TSend) => Operation<TRecv>) {
                        for (let { value, response } of yield* each(sent)) {
                          yield* spawn(function* () {
                            try {
                              let result = yield* fn(value);
                              response.postMessage(Ok(result));
                            } catch (error) {
                              response.postMessage(Err(error as Error));
                            }
                          });
                          yield* each.next();
                        }
                      },
                    },
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
            sent.send({ value, response });
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
        postMessage({ type: "open" });
      } else if (state.type === "interrupted" || state.type === "error") {
        postMessage({ type: "close", result: Err(state.error) });
      } else if (state.type === "complete") {
        postMessage({ type: "close", result: Ok(state.value) });
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
      signal.send(ref.current = value);
      return value;
    };

    const update: WorkerStateSignal["update"] = (updater) =>
      set(updater(ref.current));

    const interrupt: WorkerStateSignal["interrupt"] = () => {
      let next: Interrupted = {
        type: "interrupted",
        error: new Error(`worker terminated`),
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
          } else {
            const next: Running = { type: "running", task };
            set(next);
            return next;
          }
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

function postMessage(message: unknown): void {
  self.postMessage(message);
}