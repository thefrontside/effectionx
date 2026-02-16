import { timebox } from "@effectionx/timebox";
import {
  type Operation,
  type Subscription,
  once,
  race,
  resource,
} from "effection";
import {
  type ChannelAck,
  type ChannelMessage,
  type SerializedResult,
  serializeError,
} from "./types.ts";

/**
 * Options for creating a channel response.
 */
export interface ChannelResponseOptions {
  /** Optional timeout in milliseconds. If exceeded, throws an error. */
  timeout?: number;
}

/**
 * Requester side - creates channel, waits for SerializedResult response.
 *
 * This interface is both:
 * - An object with a `port` property to transfer to the responder
 * - An `Operation` that can be yielded to wait for the response
 *
 * The operation returns `SerializedResult<T>` which the caller must handle:
 * - `{ ok: true, value: T }` for success
 * - `{ ok: false, error: SerializedError }` for error
 *
 * For progress streaming, use the `progress` property which returns a Subscription
 * that yields progress values and returns the final response.
 *
 * @template TResponse - The response type
 * @template TProgress - The progress type (defaults to `never` for no progress)
 */
export interface ChannelResponse<TResponse, TProgress = never>
  extends Operation<SerializedResult<TResponse>> {
  /** Port to transfer to the responder */
  port: MessagePort;

  /**
   * Get a subscription that yields progress values and returns the final response.
   * Use this when you want to receive progress updates during the request.
   *
   * @example
   * ```ts
   * const subscription = yield* response.progress;
   * let next = yield* subscription.next();
   * while (!next.done) {
   *   console.log("Progress:", next.value);
   *   next = yield* subscription.next();
   * }
   * const result = next.value; // SerializedResult<TResponse>
   * ```
   */
  progress: Operation<Subscription<TProgress, SerializedResult<TResponse>>>;
}

/**
 * Responder side - wraps port, sends response as SerializedResult.
 *
 * - `resolve(value)` wraps in `{ ok: true, value }` internally
 * - `reject(error)` serializes error and wraps in `{ ok: false, error }` internally
 *
 * **Note:** `reject()` is for **application-level errors** that the requester will
 * receive as `{ ok: false, error }`. It is not a transport-level failure - the
 * response is successfully delivered and acknowledged. Use this when the operation
 * completed but with an error result (e.g., validation failed, resource not found).
 *
 * Port cleanup is handled by the resource's finally block. The close event on
 * MessagePort is used to detect requester cancellation; behavior may vary slightly
 * across runtimes (Node.js worker_threads, browser, Deno).
 *
 * @template TResponse - The response type
 * @template TProgress - The progress type (defaults to `never` for no progress)
 */
export interface ChannelRequest<TResponse, TProgress = never> {
  /** Send success response (wraps in SerializedResult internally) and wait for ACK */
  resolve(value: TResponse): Operation<void>;

  /**
   * Send error response (serializes and wraps in SerializedResult internally) and wait for ACK.
   *
   * This is for **application-level errors** - the response is still successfully
   * delivered. The requester receives `{ ok: false, error: SerializedError }`.
   */
  reject(error: Error): Operation<void>;

  /**
   * Send a progress update and wait for acknowledgement.
   * This provides backpressure - the operation blocks until the requester acknowledges.
   *
   * If the requester cancels (port closes), this returns gracefully without throwing.
   *
   * @param data - The progress data to send
   */
  progress(data: TProgress): Operation<void>;
}

/**
 * Create a MessageChannel for request-response communication.
 * Returns a `ChannelResponse` that is both an object with a `port` property
 * and an `Operation` that can be yielded to wait for the response.
 *
 * The operation:
 * - Races between receiving a message and the port closing (responder crash detection)
 * - Optionally applies a timeout if specified in options
 * - Sends ACK after receiving response
 * - Returns `SerializedResult<T>` that the caller must handle
 *
 * @example
 * ```ts
 * const response = yield* useChannelResponse<string>();
 *
 * // Transfer port to responder
 * worker.postMessage({ type: "request", response: response.port }, [response.port]);
 *
 * // Wait for response (automatically sends ACK)
 * const result = yield* response;
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   throw errorFromSerialized("Request failed", result.error);
 * }
 * ```
 *
 * @example With timeout
 * ```ts
 * const response = yield* useChannelResponse<string>({ timeout: 5000 });
 *
 * // If responder doesn't respond within 5 seconds, throws error
 * const result = yield* response;
 * ```
 *
 * @example With progress streaming
 * ```ts
 * const response = yield* useChannelResponse<string, number>();
 * const subscription = yield* response.progress;
 * let next = yield* subscription.next();
 * while (!next.done) {
 *   console.log("Progress:", next.value);
 *   next = yield* subscription.next();
 * }
 * const result = next.value; // SerializedResult<string>
 * ```
 */
export function useChannelResponse<TResponse, TProgress = never>(
  options?: ChannelResponseOptions,
): Operation<ChannelResponse<TResponse, TProgress>> {
  return resource(function* (provide) {
    const channel = new MessageChannel();
    channel.port1.start();

    try {
      yield* provide({
        port: channel.port2,

        // Direct yield* response - ignores progress, waits for final response
        *[Symbol.iterator]() {
          function* waitForResponse(): Operation<SerializedResult<TResponse>> {
            // Loop until we get a response (skip any progress messages)
            while (true) {
              // Race between message and port close (responder crashed/exited)
              const event = yield* race([
                once(channel.port1, "message"),
                once(channel.port1, "close"),
              ]);

              // If port closed, responder never responded
              if ((event as Event).type === "close") {
                throw new Error("Channel closed before response received");
              }

              const msg = (event as MessageEvent).data as ChannelMessage<
                TResponse,
                TProgress
              >;

              // If it's a progress message, ACK it and continue waiting
              if (msg.type === "progress") {
                channel.port1.postMessage({
                  type: "progress_ack",
                } satisfies ChannelAck);
                continue;
              }

              // It's a response - send ACK and return
              channel.port1.postMessage({ type: "ack" } satisfies ChannelAck);
              return msg.result;
            }
          }

          // If timeout specified, use timebox
          if (options?.timeout !== undefined) {
            const result = yield* timebox(options.timeout, waitForResponse);
            if (result.timeout) {
              throw new Error(
                `Channel response timed out after ${options.timeout}ms`,
              );
            }
            return result.value;
          }

          // No timeout - wait indefinitely (with close detection)
          return yield* waitForResponse();
        },

        // Progress subscription - yields progress values, returns final response
        get progress(): Operation<
          Subscription<TProgress, SerializedResult<TResponse>>
        > {
          const port = channel.port1;
          const timeout = options?.timeout;

          return resource(function* (provide) {
            // Create the subscription object
            const subscription: Subscription<
              TProgress,
              SerializedResult<TResponse>
            > = {
              *next() {
                function* waitForNext(): Operation<
                  IteratorResult<TProgress, SerializedResult<TResponse>>
                > {
                  // Race between message and port close
                  const event = yield* race([
                    once(port, "message"),
                    once(port, "close"),
                  ]);

                  // If port closed, throw error
                  if ((event as Event).type === "close") {
                    throw new Error("Channel closed before response received");
                  }

                  const msg = (event as MessageEvent).data as ChannelMessage<
                    TResponse,
                    TProgress
                  >;

                  if (msg.type === "progress") {
                    // ACK the progress
                    port.postMessage({
                      type: "progress_ack",
                    } satisfies ChannelAck);
                    // Yield the progress value
                    return { done: false, value: msg.data };
                  }

                  // It's a response - ACK and return done with value
                  port.postMessage({ type: "ack" } satisfies ChannelAck);
                  return { done: true, value: msg.result };
                }

                // If timeout specified, use timebox
                if (timeout !== undefined) {
                  const result = yield* timebox(timeout, waitForNext);
                  if (result.timeout) {
                    throw new Error(
                      `Channel response timed out after ${timeout}ms`,
                    );
                  }
                  return result.value;
                }

                return yield* waitForNext();
              },
            };

            yield* provide(subscription);
          });
        },
      });
    } finally {
      channel.port1.close();
    }
  });
}

/**
 * Wrap a received MessagePort to send a response.
 * Returns resolve/reject/progress operations to complete the request.
 *
 * All methods:
 * - Use the appropriate message format for progress streaming
 * - Race between ACK message and port close (requester cancellation detection)
 * - Return gracefully if port is closed (requester cancelled)
 *
 * Port cleanup is handled by the resource's finally block.
 *
 * @example Basic usage
 * ```ts
 * const { resolve, reject } = yield* useChannelRequest<string>(msg.response);
 *
 * try {
 *   const result = yield* doWork(msg.value);
 *   yield* resolve(result);  // Wrapped in { ok: true, value } internally
 * } catch (error) {
 *   yield* reject(error as Error);  // Serialized and wrapped in { ok: false, error } internally
 * }
 * ```
 *
 * @example With progress streaming
 * ```ts
 * const { resolve, progress } = yield* useChannelRequest<string, number>(msg.response);
 *
 * yield* progress(25);  // Send progress, wait for ACK
 * yield* progress(50);
 * yield* progress(75);
 * yield* resolve("complete");
 * ```
 */
export function useChannelRequest<TResponse, TProgress = never>(
  port: MessagePort,
): Operation<ChannelRequest<TResponse, TProgress>> {
  return resource(function* (provide) {
    port.start();

    /**
     * Wait for an ACK message from the requester, or exit gracefully if port closes.
     * @param expectedType - The expected ACK type ("ack" or "progress_ack")
     */
    function* waitForAck(expectedType: ChannelAck["type"]): Operation<void> {
      const event = yield* race([once(port, "message"), once(port, "close")]);

      // If port closed, requester was cancelled - exit gracefully
      if ((event as Event).type === "close") {
        return;
      }

      // Validate ACK
      const ack = (event as MessageEvent).data as ChannelAck;
      if (ack?.type !== expectedType) {
        throw new Error(`Expected ${expectedType}, got: ${ack?.type}`);
      }
    }

    try {
      yield* provide({
        *resolve(value: TResponse) {
          const msg: ChannelMessage<TResponse, TProgress> = {
            type: "response",
            result: { ok: true, value },
          };
          port.postMessage(msg);
          yield* waitForAck("ack");
        },

        *reject(error: Error) {
          const msg: ChannelMessage<TResponse, TProgress> = {
            type: "response",
            result: { ok: false, error: serializeError(error) },
          };
          port.postMessage(msg);
          yield* waitForAck("ack");
        },

        *progress(data: TProgress) {
          const msg: ChannelMessage<TResponse, TProgress> = {
            type: "progress",
            data,
          };
          port.postMessage(msg);
          yield* waitForAck("progress_ack");
        },
      });
    } finally {
      port.close();
    }
  });
}
