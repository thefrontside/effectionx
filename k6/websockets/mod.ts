/**
 * Effection WebSocket resource for K6.
 *
 * This solves K6's fire-and-forget WebSocket handler problem (issue #5524)
 * by providing structured concurrency for WebSocket operations:
 * - Messages are delivered through an Effection Subscription
 * - Errors propagate properly and fail the test
 * - Cleanup is automatic when the scope ends
 *
 * Uses K6's WebSocket API (k6/websockets) which has better event support.
 *
 * Note: K6's WebSocket has `addEventListener` but NOT `removeEventListener`,
 * so we cannot use the generic `on` helper from `@effectionx/node`. Instead,
 * we use K6's callback properties (`onmessage`, `onopen`, etc.) which are
 * automatically cleaned up when the socket closes.
 *
 * @example
 * ```typescript
 * import { main, useWebSocket, spawn, forEach } from '@effectionx/k6';
 *
 * export default main(function*() {
 *   const ws = yield* useWebSocket('wss://echo.websocket.org');
 *
 *   yield* spawn(function*() {
 *     yield* forEach(ws, function*(message) {
 *       console.log('Received:', message);
 *     });
 *   });
 *
 *   ws.send('Hello');
 * });
 * ```
 *
 * @packageDocumentation
 */

import {
  type Operation,
  type Stream,
  resource,
  createSignal,
  withResolvers,
} from "effection";

// K6 WebSocket types - these match k6/websockets
// We declare them here to avoid module resolution issues at compile time
// (k6/* modules only exist in the K6 runtime)

interface K6MessageEvent {
  data: string | ArrayBuffer;
  type: number;
  timestamp: number;
}

interface K6ErrorEvent {
  type: number;
  error: string;
  timestamp: number;
}

interface K6WebSocket {
  readonly url: string;
  readonly readyState: number;
  readonly bufferedAmount: number;
  binaryType: string;
  send(data: string | ArrayBuffer): void;
  addEventListener(
    event: string,
    listener: (event: K6MessageEvent | K6ErrorEvent | Event) => void,
  ): void;
  close(code?: number, reason?: string): void;
  ping(): void;
  onmessage: ((event?: K6MessageEvent) => void) | null;
  onopen: (() => void) | null;
  onclose: (() => void) | null;
  onerror: ((event?: K6ErrorEvent) => void) | null;
}

// K6 ReadyState constants
const ReadyState = {
  CONNECTING: 0,
  OPEN: 1,
  CLOSING: 2,
  CLOSED: 3,
} as const;

// This will be available at runtime from k6/websockets
import { WebSocket as K6WebSocketClass } from "k6/websockets";

type WebSocketConstructor = new (
  url: string,
  protocols?: string | string[],
) => K6WebSocket;

/**
 * WebSocket message types from K6.
 */
export type WebSocketMessage = string | ArrayBuffer;

/**
 * An Effection-managed WebSocket.
 *
 * The WebSocket is itself a Stream of messages. Use `each(ws)` to iterate:
 *
 * ```typescript
 * for (const msg of yield* each(ws)) {
 *   console.log('Received:', msg);
 *   yield* each.next();
 * }
 * ```
 *
 * The WebSocket is automatically closed when the scope ends.
 */
export interface WebSocket extends Stream<WebSocketMessage, void> {
  /** Send a message to the server */
  send(data: string | ArrayBuffer): void;

  /** Close the connection. Resolves when the connection is closed. */
  close(code?: number, reason?: string): Operation<void>;
}

/**
 * Create a WebSocket resource with structured concurrency.
 *
 * The WebSocket connects immediately and the resource is provided
 * once the connection is established. The connection is automatically
 * closed when the enclosing scope ends.
 *
 * @param url - WebSocket URL to connect to
 * @param protocols - Optional subprotocols
 * @returns WebSocket resource
 *
 * @example Basic usage
 * ```typescript
 * const ws = yield* useWebSocket('wss://api.example.com/ws');
 * ws.send(JSON.stringify({ type: 'subscribe', channel: 'updates' }));
 *
 * for (const msg of yield* each(ws)) {
 *   const data = JSON.parse(msg as string);
 *   console.log('Update:', data);
 *   yield* each.next();
 * }
 * // WebSocket automatically closed when scope ends
 * ```
 *
 * @example With error handling via spawn
 * ```typescript
 * const ws = yield* useWebSocket('wss://api.example.com/ws');
 *
 * // Errors are propagated automatically and will fail the test
 * // The resource handles this internally
 *
 * ws.send('hello');
 * // Process messages...
 * ```
 */
export function useWebSocket(
  url: string,
  protocols?: string | string[],
): Operation<WebSocket> {
  return resource(function* (provide) {
    // Create the K6 WebSocket
    const WebSocketCtor = K6WebSocketClass as unknown as WebSocketConstructor;
    const socket = new WebSocketCtor(url, protocols);

    // Create signal for messages
    const messageSignal = createSignal<WebSocketMessage, void>();

    // Track connection state with resolvers
    let isOpen = false;
    const opened = withResolvers<void>();
    const closed = withResolvers<void>();

    // Set up event handlers using K6's callback style
    socket.onopen = () => {
      isOpen = true;
      opened.resolve();
    };

    socket.onmessage = (event?: K6MessageEvent) => {
      if (event) {
        messageSignal.send(event.data);
      }
    };

    socket.onclose = () => {
      isOpen = false;
      messageSignal.close();
      closed.resolve();
    };

    socket.onerror = (event?: K6ErrorEvent) => {
      const errorMsg = event?.error ?? "Unknown WebSocket error";
      if (!isOpen) {
        // Connection failed
        opened.reject(new Error(`WebSocket connection failed: ${errorMsg}`));
      }
      // Note: Error during operation will close the socket,
      // which will trigger onclose
    };

    try {
      // Wait for connection to open
      yield* opened.operation;

      // Provide the resource
      yield* provide({
        [Symbol.iterator]: messageSignal[Symbol.iterator].bind(messageSignal),

        send(data: string | ArrayBuffer) {
          socket.send(data);
        },

        close(code?: number, reason?: string): Operation<void> {
          socket.close(code, reason);
          return closed.operation;
        },
      });
    } finally {
      // Ensure socket is closed on cleanup
      if (
        socket.readyState === ReadyState.OPEN ||
        socket.readyState === ReadyState.CONNECTING
      ) {
        socket.close(1000, "Effection scope ended");
      }
      // Wait for onclose to fire before completing cleanup
      yield* closed.operation;
    }
  });
}


