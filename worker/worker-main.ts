import {
  createSignal,
  each,
  Err,
  main,
  Ok,
  on,
  type Operation,
  type Result,
  scoped,
  spawn,
  withResolvers,
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
    let controls = yield* on(self, "message");
    let outcome = withResolvers<Result<TReturn>>();

    self.postMessage({ type: "open" });

    let result = yield* scoped(function* () {
      yield* spawn(function* () {
        let next = yield* controls.next();
        while (true) {
          let control: WorkerControl<TSend, TData> = next.value.data;
          if (control.type === "init") {
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

                outcome.resolve(Ok(value));
              } catch (error) {
                outcome.resolve(Err(error as Error));
              }
            });
          } else if (control.type === "send") {
            let { value, response } = control;
            sent.send({ value, response });
          } else if (control.type === "close") {
            outcome.resolve(Err(new Error(`worker terminated`)));
          }
          next = yield* controls.next();
        }
      });

      return yield* outcome.operation;
    });
    self.postMessage({ type: "close", result });
  });
}
