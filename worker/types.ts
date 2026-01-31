import type { Operation, Result } from "effection";

/**
 * Messages sent from host to worker (control messages).
 */
export type WorkerControl<TSend, TData> =
  | {
      type: "init";
      data: TData;
    }
  | {
      type: "send";
      value: TSend;
      response: MessagePort;
    }
  | {
      type: "close";
    };

/**
 * Messages sent from worker to host.
 *
 * @template WRequest - value worker sends to host in requests
 * @template TReturn - return value when worker completes
 */
export type WorkerToHost<WRequest, TReturn> =
  | { type: "open" }
  | { type: "request"; value: WRequest; response: MessagePort }
  | { type: "close"; result: Result<TReturn> };

/**
 * Serialized error format for cross-boundary communication.
 * Error objects cannot be cloned via postMessage, so we serialize them.
 */
export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
}

/**
 * Serialize an Error for transmission via postMessage.
 */
export function serializeError(error: Error): SerializedError {
  return {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
}

/**
 * Create an Error from a serialized error, with original data in `cause`.
 *
 * @param context - Description of where the error occurred (e.g., "Host handler failed")
 * @param serialized - The serialized error data
 */
export function errorFromSerialized(
  context: string,
  serialized: SerializedError,
): Error {
  return new Error(`${context}: ${serialized.message}`, {
    cause: serialized,
  });
}

/**
 * Options passed to the worker's main function.
 *
 * @template TSend - value host sends to worker
 * @template TRecv - value host receives from worker (response to host's send)
 * @template TData - initial data passed to worker
 * @template WRequest - value worker sends to host in requests
 * @template WResponse - value worker receives from host (response to worker's send)
 */
export interface WorkerMainOptions<
  TSend,
  TRecv,
  TData,
  WRequest = never,
  WResponse = never,
> {
  /**
   * Namespace that provides APIs for working with incoming messages from host.
   */
  messages: WorkerMessages<TSend, TRecv>;
  /**
   * Initial data received by the worker from the main thread used for initialization.
   */
  data: TData;
  /**
   * Send a request to the host and wait for a response.
   * Only available if WRequest and WResponse type parameters are provided.
   */
  send: (value: WRequest) => Operation<WResponse>;
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
