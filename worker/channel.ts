import { type Operation, resource, once } from "effection";

/**
 * Requester side - creates channel, waits for response
 */
export interface ChannelResponse<T> {
  /** Port to transfer to the responder */
  port: MessagePort;

  /** Operation that waits for the response (sends ACK after receiving) */
  operation: Operation<T>;
}

/**
 * Responder side - wraps port, sends response
 */
export interface ChannelRequest<T> {
  /** Send success response and wait for ACK */
  resolve(value: T): Operation<void>;

  /** Send error response and wait for ACK */
  reject(error: Error): Operation<void>;
}

/**
 * Create a MessageChannel for request-response communication.
 * Returns a port to transfer and an operation to await the response.
 *
 * @example
 * ```ts
 * const { port, operation } = yield* useChannelResponse<Result<string>>();
 *
 * // Transfer port to responder
 * worker.postMessage({ type: "request", response: port }, [port]);
 *
 * // Wait for response (automatically sends ACK)
 * const result = yield* operation;
 * ```
 */
export function useChannelResponse<T>(): Operation<ChannelResponse<T>> {
  return resource(function* (provide) {
    const channel = new MessageChannel();
    channel.port1.start();

    try {
      yield* provide({
        port: channel.port2,

        operation: {
          *[Symbol.iterator]() {
            // Wait for response
            const event = yield* once(channel.port1, "message");
            const data = (event as MessageEvent).data as T;

            // Send ACK
            channel.port1.postMessage({ type: "ack" });

            return data;
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
 * @example
 * ```ts
 * const { resolve, reject } = yield* useChannelRequest<Result<string>>(msg.response);
 *
 * try {
 *   const result = yield* doWork(msg.value);
 *   yield* resolve(Ok(result));
 * } catch (error) {
 *   yield* reject(Err(error));
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
        resolve(value: T): Operation<void> {
          return {
            *[Symbol.iterator]() {
              port.postMessage(value);

              // Wait for ACK with validation
              const event = yield* once(port, "message");
              const msg = (event as MessageEvent).data;
              if (msg?.type !== "ack") {
                throw new Error(`Expected ACK, got: ${msg?.type}`);
              }

              port.close();
            },
          };
        },

        reject(error: Error): Operation<void> {
          return {
            *[Symbol.iterator]() {
              port.postMessage(error);

              // Wait for ACK with validation
              const event = yield* once(port, "message");
              const msg = (event as MessageEvent).data;
              if (msg?.type !== "ack") {
                throw new Error(`Expected ACK, got: ${msg?.type}`);
              }

              port.close();
            },
          };
        },
      });
    } finally {
      port.close();
    }
  });
}
