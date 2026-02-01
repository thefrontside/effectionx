import type { Operation, Result, Subscription } from "effection";

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
 * A Result type for cross-boundary communication where errors are serialized.
 * Unlike effection's Result<T> which uses Error, this uses SerializedError.
 *
 * Used by channel primitives to send success/error responses over MessageChannel.
 */
export type SerializedResult<T> =
  | { ok: true; value: T }
  | { ok: false; error: SerializedError };

/**
 * Messages sent over a channel that supports progress streaming.
 * Used by useChannelRequest to send progress updates and final response.
 */
export type ChannelMessage<TResponse, TProgress> =
  | { type: "progress"; data: TProgress }
  | { type: "response"; result: SerializedResult<TResponse> };

/**
 * Acknowledgement messages sent back over a channel.
 * Used by useChannelResponse to acknowledge receipt of messages.
 */
export type ChannelAck = { type: "ack" } | { type: "progress_ack" };

/**
 * Context passed to forEach handler for progress streaming.
 * Allows the handler to send progress updates back to the requester.
 *
 * @template TProgress - The progress data type
 */
export interface ForEachContext<TProgress> {
  /**
   * Send a progress update to the requester.
   * This operation blocks until the requester acknowledges receipt (backpressure).
   *
   * @param data - The progress data to send
   */
  progress(data: TProgress): Operation<void>;
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
 * A send function that supports both simple request/response and progress streaming.
 *
 * @template WRequest - value worker sends to host
 * @template WResponse - value worker receives from host
 */
export interface WorkerSend<WRequest, WResponse> {
  /**
   * Send a request to the host and wait for a response.
   * Ignores any progress updates from the host.
   */
  (value: WRequest): Operation<WResponse>;

  /**
   * Send a request to the host and receive a subscription that yields
   * progress updates and returns the final response.
   *
   * @template WProgress - progress type from host
   *
   * @example
   * ```ts
   * const subscription = yield* send.stream<number>(request);
   * let next = yield* subscription.next();
   * while (!next.done) {
   *   console.log("Progress:", next.value);
   *   next = yield* subscription.next();
   * }
   * const response = next.value;
   * ```
   */
  stream<WProgress>(
    value: WRequest,
  ): Operation<Subscription<WProgress, WResponse>>;
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
   * Also supports progress streaming via `send.stream()`.
   */
  send: WorkerSend<WRequest, WResponse>;
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
