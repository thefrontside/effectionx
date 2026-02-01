import { type Operation, resource, once, race } from "effection";
import { timebox } from "@effectionx/timebox";
import { serializeError, type SerializedResult } from "./types.ts";

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
 * The operation returns `SerializedResult<T>` which the caller must handle:
 * - `{ ok: true, value: T }` for success
 * - `{ ok: false, error: SerializedError }` for error
 */
export interface ChannelResponse<T> {
  /** Port to transfer to the responder */
  port: MessagePort;

  /** Operation that waits for SerializedResult<T> response (sends ACK after receiving) */
  operation: Operation<SerializedResult<T>>;
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
 */
export interface ChannelRequest<T> {
  /** Send success response (wraps in SerializedResult internally) and wait for ACK */
  resolve(value: T): Operation<void>;

  /**
   * Send error response (serializes and wraps in SerializedResult internally) and wait for ACK.
   *
   * This is for **application-level errors** - the response is still successfully
   * delivered. The requester receives `{ ok: false, error: SerializedError }`.
   */
  reject(error: Error): Operation<void>;
}

/**
 * Create a MessageChannel for request-response communication.
 * Returns a port to transfer and an operation to await the response.
 *
 * The operation:
 * - Races between receiving a message and the port closing (responder crash detection)
 * - Optionally applies a timeout if specified in options
 * - Sends ACK after receiving response
 * - Returns `SerializedResult<T>` that the caller must handle
 *
 * @example
 * ```ts
 * const { port, operation } = yield* useChannelResponse<string>();
 *
 * // Transfer port to responder
 * worker.postMessage({ type: "request", response: port }, [port]);
 *
 * // Wait for response (automatically sends ACK)
 * const result = yield* operation;
 * if (result.ok) {
 *   console.log(result.value);
 * } else {
 *   throw errorFromSerialized("Request failed", result.error);
 * }
 * ```
 *
 * @example With timeout
 * ```ts
 * const { port, operation } = yield* useChannelResponse<string>({ timeout: 5000 });
 *
 * // If responder doesn't respond within 5 seconds, throws error
 * const result = yield* operation;
 * ```
 */
export function useChannelResponse<T>(
  options?: ChannelResponseOptions,
): Operation<ChannelResponse<T>> {
  return resource(function* (provide) {
    const channel = new MessageChannel();
    channel.port1.start();

    try {
      yield* provide({
        port: channel.port2,

        operation: {
          *[Symbol.iterator]() {
            function* waitForResponse(): Operation<SerializedResult<T>> {
              // Race between response message and port close (responder crashed/exited)
              const event = yield* race([
                once(channel.port1, "message"),
                once(channel.port1, "close"),
              ]);

              // If port closed, responder never responded
              if ((event as Event).type === "close") {
                throw new Error("Channel closed before response received");
              }

              const data = (event as MessageEvent).data as SerializedResult<T>;

              // Send ACK
              channel.port1.postMessage({ type: "ack" });

              return data;
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
        },
      });
    } finally {
      channel.port1.close();
    }
  });
}

/**
 * Wrap a received MessagePort to send a response.
 * Returns resolve/reject operations to complete the request.
 *
 * Both resolve and reject:
 * - Wrap the response in SerializedResult internally
 * - Send the wrapped response
 * - Race between ACK message and port close (requester cancellation detection)
 * - Clean up the port
 *
 * @example
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
 */
export function useChannelRequest<T>(
  port: MessagePort,
): Operation<ChannelRequest<T>> {
  return resource(function* (provide) {
    port.start();

    try {
      yield* provide({
        *resolve(value: T) {
          // Wrap in SerializedResult internally
          const result: SerializedResult<T> = { ok: true, value };
          port.postMessage(result);

          // Race between ACK message and port close (requester cancelled)
          const event = yield* race([
            once(port, "message"),
            once(port, "close"),
          ]);

          // If port closed, requester was cancelled - exit gracefully
          if ((event as Event).type === "close") {
            return;
          }

          // Validate ACK
          const msg = (event as MessageEvent).data;
          if (msg?.type !== "ack") {
            throw new Error(`Expected ACK, got: ${msg?.type}`);
          }
          // Port cleanup handled by finally block
        },

        *reject(error: Error) {
          // Serialize and wrap in SerializedResult internally
          const result: SerializedResult<T> = {
            ok: false,
            error: serializeError(error),
          };
          port.postMessage(result);

          // Race between ACK message and port close (requester cancelled)
          const event = yield* race([
            once(port, "message"),
            once(port, "close"),
          ]);

          // If port closed, requester was cancelled - exit gracefully
          if ((event as Event).type === "close") {
            return;
          }

          // Validate ACK
          const msg = (event as MessageEvent).data;
          if (msg?.type !== "ack") {
            throw new Error(`Expected ACK, got: ${msg?.type}`);
          }
          // Port cleanup handled by finally block
        },
      });
    } finally {
      port.close();
    }
  });
}
