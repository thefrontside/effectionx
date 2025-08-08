import { assert } from "@std/assert";
import {
  createSignal,
  each,
  Err,
  main,
  Ok,
  on,
  once,
  type Operation,
  resource,
  type Result,
  scoped,
  spawn,
  withResolvers,
} from "effection";

export interface WorkerResource<TSend, TRecv, TReturn>
  extends Operation<TReturn> {
  send(data: TSend): Operation<TRecv>;
}

/**
 * Object that represents messages the main thread
 * sends to the worker. It provides function for
 * handling messages.
 *
 * @template TSend - value main thread will send to the worker
 * @template TRecv - value main thread will receive from the worker
 */
export interface WorkerMessages<TSend, TRecv> {
  forEach(fn: (message: TSend) => Operation<TRecv>): Operation<void>;
}

/**
 * Argument received by workerMain function
 *
 * @template TSend - value main thread will send to the worker
 * @template TRecv - value main thread will receive from the worker
 * @template TData - data passed from the main thread to the worker during initialization
 */
export interface WorkerMainOptions<TSend, TRecv, TData> {
  /**
   * Namespace that provides APIs for working with incoming messages
   */
  messages: WorkerMessages<TSend, TRecv>;
  /**
   * Initial data received by the worker from the main thread used for initialization.
   */
  data: TData;
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

    let onclose = (event: MessageEvent) => {
      if (event.data.type === "close") {
        let { result } = event.data as { result: Result<TReturn> };
        if (result.ok) {
          outcome.resolve(result.value);
        } else {
          outcome.reject(result.error);
        }
      }
    };

    worker.addEventListener("message", onclose);

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
          worker.postMessage({
            type: "send",
            value,
            response: channel.port2,
          }, [channel.port2]);
          channel.port1.start();
          let event = yield* once(channel.port1, "message");
          let result = event.data;
          if (result.ok) {
            return result.value;
          } else {
            throw result.error;
          }
        },
        [Symbol.iterator]: outcome.operation[Symbol.iterator],
      });
    } finally {
      worker.postMessage({ type: "close" });
      yield* settled(outcome.operation);
      worker.removeEventListener("message", onclose);
    }
  });
}

type WorkerControl<TSend, TData> = {
  type: "init";
  data: TData;
} | {
  type: "send";
  value: TSend;
  response: MessagePort;
} | {
  type: "close";
};

function useMessageChannel(): Operation<MessageChannel> {
  return resource(function* (provide) {
    let channel = new MessageChannel();
    try {
      yield* provide(channel);
    } finally {
      channel.port1.close();
      channel.port2.close();
    }
  });
}

function settled<T>(operation: Operation<T>): Operation<Result<void>> {
  return {
    *[Symbol.iterator]() {
      try {
        yield* operation;
        return Ok();
      } catch (error) {
        return Err(error as Error);
      }
    },
  };
}
