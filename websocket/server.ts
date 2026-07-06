import { createQueue, each, resource, spawn } from "effection";
import type { Operation, Stream } from "effection";
import { on, once } from "@effectionx/node";
import type { EventEmitterLike } from "@effectionx/node";

import { type WebSocketResource, useWebSocket } from "./websocket.ts";

/**
 * The minimal structural surface of a
 * [`ws`](https://github.com/websockets/ws) `WebSocketServer` (or any
 * compatible server) that {@link useWebSocketServer} needs: an
 * {@link EventEmitterLike} that emits `connection` and `error` events, plus a
 * `close` method.
 *
 * This is intentionally narrow so that the package never has to import a
 * concrete server implementation and stays platform-agnostic. Because the
 * `connection` event of the `ws` library yields its own `WebSocket` type
 * rather than the DOM `WebSocket`, you may need to cast when passing a real
 * server, e.g. `new WebSocketServer({ port }) as unknown as WebSocketServerLike`
 * — mirroring the `ws as unknown as WebSocket` cast used with the client.
 */
export interface WebSocketServerLike extends EventEmitterLike {
  close(callback?: () => void): void;
}

/**
 * Handle to a WebSocket server consumed as an Effection {@link Stream}. Each
 * value in the stream is a {@link WebSocketResource} representing a single
 * client connection.
 *
 * A `WebSocketServerResource` has no explicit close method. The underlying
 * server — and every live connection it produced — is automatically closed
 * when the resource passes out of scope.
 */
export interface WebSocketServerResource<T>
  extends Stream<WebSocketResource<T>, never> {}

/**
 * Create a WebSocket server resource that yields a {@link Stream} of incoming
 * client connections. Each connection is a {@link WebSocketResource} — the very
 * same full-duplex handle produced by {@link useWebSocket} on the client — so
 * you receive messages by iterating it and reply with `yield* connection.send()`.
 *
 * The creation of the underlying server is delegated to a factory function,
 * keeping this package free of any concrete server dependency. On Node this is
 * typically the [`ws`](https://github.com/websockets/ws) `WebSocketServer`.
 *
 * Connections are buffered, so none are dropped between the moment the server
 * starts listening and the moment you begin iterating. Since a stream is
 * consumed sequentially, spawn a handler per connection to serve many clients
 * concurrently:
 *
 * ```ts
 * import { each, main, spawn } from "effection";
 * import { WebSocketServer } from "ws";
 * import { useWebSocketServer, type WebSocketServerLike } from "@effectionx/websocket";
 *
 * await main(function* () {
 *   let server = yield* useWebSocketServer<string>(
 *     () => new WebSocketServer({ port: 3000 }) as unknown as WebSocketServerLike,
 *   );
 *
 *   for (let connection of yield* each(server)) {
 *     yield* spawn(function* () {
 *       for (let message of yield* each(connection)) {
 *         yield* connection.send(`echo: ${message.data}`);
 *         yield* each.next();
 *       }
 *     });
 *     yield* each.next();
 *   }
 * });
 * ```
 *
 * @param create - a function that constructs the underlying server object that
 * this resource will manage
 * @returns an operation yielding a {@link WebSocketServerResource}
 */
export function useWebSocketServer<T>(
  create: () => WebSocketServerLike,
): Operation<WebSocketServerResource<T>> {
  return resource(function* (provide) {
    let server = create();

    let connections = createQueue<WebSocketResource<T>, never>();

    // crash the resource scope if the server itself errors, mirroring the
    // client's `throw yield* once(socket, "error")` behavior
    yield* spawn(function* () {
      let [error] = yield* once<[Error]>(server, "error");
      throw error;
    });

    // accept connections: wrap each raw socket with the client resource and
    // publish it. `useWebSocket` self-terminates when its socket closes, so no
    // per-connection task or drain loop is needed — the wrapped connections live
    // concurrently in this accept task's scope.
    yield* spawn(function* () {
      for (let [raw] of yield* each(on<[WebSocket]>(server, "connection"))) {
        connections.add(yield* useWebSocket<T>(() => raw));
        yield* each.next();
      }
    });

    try {
      // a queue is itself a subscription; expose it as a stream whose
      // subscription is the shared connection queue
      yield* provide({
        *[Symbol.iterator]() {
          return connections;
        },
      });
    } finally {
      // stop accepting new connections; the live connection tasks close their
      // own sockets as this scope tears down. We don't await the close callback
      // here because it can depend on those sockets closing, which happens as
      // part of this same teardown.
      server.close();
    }
  });
}
