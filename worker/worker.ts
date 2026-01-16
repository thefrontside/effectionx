import assert from "node:assert";
import {
  Err,
  Ok,
  on,
  once,
  type Operation,
  resource,
  type Result,
  spawn,
  withResolvers,
} from "effection";
import Worker from "web-worker";

import { useMessageChannel } from "./message-channel.ts";

/**
 * Argument received by workerMain function
 *
 * @template TSend - value main thread will send to the worker
 * @template TRecv - value main thread will receive from the worker
 * @template TData - data passed from the main thread to the worker during initialization
 */
export interface WorkerResource<TSend, TRecv, TReturn>
  extends Operation<TReturn> {
  send(data: TSend): Operation<TRecv>;
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
