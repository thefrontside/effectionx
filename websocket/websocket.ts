import { timebox } from "@effectionx/timebox";
import {
  createSignal,
  ensure,
  once,
  race,
  resource,
  spawn,
  withResolvers,
} from "effection";
import type { Operation, Stream } from "effection";

export interface UseWebSocketOptions {
  /**
   * How many milliseconds to wait for the peer's close handshake before
   * allowing teardown to continue. Defaults to `1000`.
   */
  closeTimeout?: number;
}

/**
 * Handle to a
 * [`WebSocket`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) object
 * that can be consumed as an Effection stream. It has all the same properties as
 * the underlying `WebSocket` apart from the event handlers. Instead, the resource
 * itself is a subscribale stream. When the socket is closed, the stream will
 * complete with a [`CloseEvent`](https://developer.mozilla.org/en-US/docs/Web/API/CloseEvent)
 *
 * The underlying socket is automatically closed when the resource passes out of
 * scope (with code `1000` and reason `"released"`). For a different close code
 * or reason — e.g. a `1001` "going away" on server shutdown — compose an
 * explicit {@link WebSocketResource.close} before the resource is released.
 */
export interface WebSocketResource<T>
  extends Stream<MessageEvent<T>, CloseEvent> {
  /**
   * the type of data that this websocket accepts
   */
  readonly binaryType: BinaryType;
  readonly bufferedAmmount: number;
  readonly extensions: string;
  readonly protocol: string;
  readonly readyState: number;
  readonly url: string;
  send(data: WebSocketData): Operation<void>;
  /**
   * Close the socket with an explicit code and reason, resolving once the close
   * handshake completes (bounded by an internal timeout so a silent peer cannot
   * hang). Because the first close wins, calling this before the resource is
   * released lets you choose the close code the peer observes; the automatic
   * scope-exit close then becomes a no-op.
   *
   * The code is handed to the underlying socket unchanged, so which codes are
   * legal depends on the implementation. The WHATWG API accepts only `1000` and
   * `3000`–`4999`, throwing `InvalidAccessError` for anything else, while a
   * `ws` socket accepts the full RFC 6455 range — `1001` ("going away")
   * included.
   *
   * @param code - a close code the underlying socket accepts (default `1000`)
   * @param reason - a close reason string (default `"released"`)
   */
  close(code?: number, reason?: string): Operation<void>;
}

/**
 * Create a [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
 * resource using the native
 * [WebSocket constructor](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket)
 * available on the current platform.
 *
 * The resource will not be returned until a connection has been
 * succesffuly established with the server and the
 * [`open`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/open_event)
 * has been received. Once initialized, it will crash if it receives
 * an [`error`]() event at any time.
 *
 * Once created, the websocket resource can be use to consume events from the server:
 *
 * ```ts
 * let socket = yield* useWebSocket("ws://websocket.example.org");
 *
 * for (let event of yield* each(socket)) {
 *   console.log('event data: ', event.data);
 *   yield* each.next();
 * }
 * ```
 *
 * @param url - The URL of the target WebSocket server to connect to. The URL must use one of the following schemes: ws, wss, http, or https, and cannot include a URL fragment. If a relative URL is provided, it is relative to the base URL of the calling script. For more detail, see https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/WebSocket#url
 *
 * @param protocolsOrOptions - A sub-protocol string, or resource options when
 * no sub-protocol is needed
 * @param options - Resource options when a sub-protocol is provided
 *
 * @returns an operation yielding a {@link WebSocketResource}
 */
export function useWebSocket<T>(
  url: string,
  protocolsOrOptions?: string | UseWebSocketOptions,
  options?: UseWebSocketOptions,
): Operation<WebSocketResource<T>>;

/**
 * Create a [WebSocket](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket)
 * resource, but delegate the creation of the underlying websocket to a function
 * of your choice. This is necessary on platforms that do not have a global
 * `WebSocket` constructor such as NodeJS \<= 20.
 *
 * The resource will not be returned until a connection has been
 * succesffuly established with the server and the
 * [`open`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket/open_event)
 * has been received. Once initialized, it will crash if it receives
 * an [`error`]() event at any time.
 *
 * Once created, the websocket resource can be use to consume events from the server:
 *
 * ```ts
 * import * as ws from 'ws';
 *
 * function* example() {
 *   let socket = yield* useWebSocket(() => new ws.WebSocket("ws://websocket.example.org"));
 *
 *   for (let event of yield* each(socket)) {
 *     console.log('event data: ', event.data);
 *     yield* each.next();
 *   }
 * }
 *
 * ```
 * @param create - a function that will construct the underlying [`WebSocket`](https://developer.mozilla.org/en-US/docs/Web/API/WebSocket) object that this resource wil use
 * @param options - Resource options
 * @returns an operation yielding a {@link WebSocketResource}
 */
export function useWebSocket<T>(
  create: () => WebSocket,
  options?: UseWebSocketOptions,
): Operation<WebSocketResource<T>>;

/**
 * @ignore the catch-all version that supports both forms above.
 */
export function useWebSocket<T>(
  url: string | (() => WebSocket),
  protocolsOrOptions?: string | UseWebSocketOptions,
  additionalOptions: UseWebSocketOptions = {},
): Operation<WebSocketResource<T>> {
  return resource(function* (provide) {
    let protocols =
      typeof protocolsOrOptions === "string" ? protocolsOrOptions : undefined;
    let options =
      typeof protocolsOrOptions === "object"
        ? protocolsOrOptions
        : additionalOptions;
    let { closeTimeout = 1000 } = options;
    let socket =
      typeof url === "string" ? new WebSocket(url, protocols) : url();

    let messages = createSignal<MessageEvent<T>, CloseEvent>();
    let { operation: closed, resolve: close } = withResolvers<CloseEvent>();

    yield* spawn(function* () {
      throw yield* once(socket, "error");
    });

    // Only wait for 'open' if socket isn't already open
    if (socket.readyState !== WebSocket.OPEN) {
      yield* once(socket, "open");
    }

    yield* spawn(function* () {
      let subscription = yield* messages;
      let next = yield* subscription.next();
      while (!next.done) {
        next = yield* subscription.next();
      }
      close(next.value);
    });

    // The first close wins, so whoever calls this first picks the code the peer
    // sees. On timeout we stop waiting rather than forcing a terminate.
    function* closeSocket(code: number, reason: string): Operation<void> {
      socket.close(code, reason);
      yield* timebox(closeTimeout, () => closed);
    }

    // Don't hoist this above the spawns — teardown would hang waiting on
    // `closed`.
    yield* ensure(function* () {
      // A no-op if the caller already closed with an explicit code via `close()`.
      yield* closeSocket(1000, "released");
      socket.removeEventListener("message", messages.send);
      socket.removeEventListener("close", messages.close);
    });

    socket.addEventListener("message", messages.send);
    socket.addEventListener("close", messages.close);

    yield* race([
      closed,
      provide({
        get binaryType() {
          return socket.binaryType;
        },
        get bufferedAmmount() {
          return socket.bufferedAmount;
        },
        get extensions() {
          return socket.extensions;
        },
        get protocol() {
          return socket.protocol;
        },
        get readyState() {
          return socket.readyState;
        },
        get url() {
          return socket.url;
        },
        *send(data: WebSocketData): Operation<void> {
          socket.send(data);
        },
        *close(code = 1000, reason = "released"): Operation<void> {
          yield* closeSocket(code, reason);
        },
        [Symbol.iterator]: messages[Symbol.iterator],
      }),
    ]);
  });
}

/**
 * @ignore
 */
export type WebSocketData = Parameters<WebSocket["send"]>[0];
