import type { Operation } from "effection";

export type WorkerControl<TSend, TData> = {
  type: "init";
  data: TData;
} | {
  type: "send";
  value: TSend;
  response: MessagePort;
} | {
  type: "close";
};

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
