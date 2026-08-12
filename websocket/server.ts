import { on, once } from "@effectionx/node";
import type { EventEmitterLike } from "@effectionx/node";
import {
  all,
  createQueue,
  createSignal,
  each,
  ensure,
  resource,
  scoped,
  spawn,
} from "effection";
import type { Operation, Stream, Subscription } from "effection";

import {
  type UseWebSocketOptions,
  type WebSocketResource,
  useWebSocket,
} from "./websocket.ts";

/**
 * The minimal structural surface of a
 * [`ws`](https://github.com/websockets/ws) `WebSocketServer` (or any
 * compatible server) that {@link useWebSocketServer} needs: an
 * {@link EventEmitterLike} that emits `connection` and `error` events, plus a
 * `close` method.
 *
 * This is intentionally narrow so that the package never has to import a
 * concrete server implementation and stays platform-agnostic. A `ws`
 * `WebSocketServer` satisfies it structurally, so it can be passed directly
 * with no cast.
 */
export interface WebSocketServerLike extends EventEmitterLike {
  close(callback?: () => void): void;
}

/**
 * Handle to a WebSocket server, consumed as an Effection
 * {@link Subscription} of incoming client connections. Each value is a
 * {@link WebSocketResource} representing a single client.
 *
 * This is deliberately a subscription rather than a {@link Stream}. A stream is
 * stateless — subscribing to it is what allocates state — whereas a server
 * starts listening and buffering connections the moment the resource is
 * created, and every consumer draws from that one shared buffer. Handing back a
 * subscription says so in the type: reading a connection consumes it, and there
 * is no second independent replay of the connections that already arrived.
 *
 * A `WebSocketServerResource` has no explicit close method. The underlying
 * server — and every live connection it produced — is automatically closed
 * when the resource passes out of scope.
 */
export interface WebSocketServerResource<T>
  extends Subscription<WebSocketResource<T>, never> {
  /**
   * A stream of errors raised by individual connections. A failing connection
   * is isolated — it does not crash the server — and whatever it threw (for a
   * socket failure, the DOM `error` event) is published here so you can observe
   * per-connection failures by consuming this stream (rather than via a
   * callback). It is lossy: errors emitted while nobody is subscribed are not
   * buffered.
   */
  errors: Stream<unknown, never>;
}

/**
 * Create a WebSocket server resource that hands back a {@link Subscription} of
 * incoming client connections. Each connection is a {@link WebSocketResource} —
 * the very same full-duplex handle produced by {@link useWebSocket} on the
 * client — so you receive messages by iterating it and reply with
 * `yield* connection.send()`.
 *
 * The creation of the underlying server is delegated to a factory function,
 * keeping this package free of any concrete server dependency. On Node this is
 * typically the [`ws`](https://github.com/websockets/ws) `WebSocketServer`.
 *
 * Connections are buffered from the moment the resource is created, so none are
 * dropped before you start reading. Because connections are read one at a time,
 * spawn a handler per connection to serve many clients concurrently:
 *
 * ```ts
 * import { each, main, spawn } from "effection";
 * import { WebSocketServer } from "ws";
 * import { useWebSocketServer } from "@effectionx/websocket";
 *
 * await main(function* () {
 *   let connections = yield* useWebSocketServer<string>(
 *     () => new WebSocketServer({ port: 3000 }),
 *   );
 *
 *   while (true) {
 *     let { value: connection } = yield* connections.next();
 *     yield* spawn(function* () {
 *       for (let message of yield* each(connection)) {
 *         yield* connection.send(`echo: ${message.data}`);
 *         yield* each.next();
 *       }
 *     });
 *   }
 * });
 * ```
 *
 * @param create - a function that constructs the underlying server object that
 * this resource will manage
 * @param options - options applied to every accepted WebSocket connection
 * @returns an operation yielding a {@link WebSocketServerResource}
 */
export function useWebSocketServer<T>(
  create: () => WebSocketServerLike,
  options: UseWebSocketOptions = {},
): Operation<WebSocketServerResource<T>> {
  return resource(function* (provide) {
    let server = create();

    // Two collections with different jobs: `accepted` is the delivery buffer,
    // drained as the consumer reads, while `live` is the roster of still-open
    // connections used to close them on shutdown. A connection sits in both
    // until it is read, and stays in `live` long after it has left the buffer.
    let accepted = createQueue<WebSocketResource<T>, never>();
    let live = new Set<WebSocketResource<T>>();
    let errors = createSignal<unknown, never>();

    // crash the resource scope if the server itself errors, mirroring the
    // client's `throw yield* once(socket, "error")` behavior
    yield* spawn(function* () {
      let [error] = yield* once<[Error]>(server, "error");
      throw error;
    });

    // `scoped` contains a crash rather than letting it escalate, so one socket
    // erroring is isolated to its own connection and reported on `errors`
    // instead of taking down the server. Each connection is held open until its
    // socket closes.
    yield* spawn(function* () {
      for (let [raw] of yield* each(on<[WebSocket]>(server, "connection"))) {
        yield* spawn(function* () {
          try {
            yield* scoped(function* () {
              let connection = yield* useWebSocket<T>(() => raw, options);
              live.add(connection);
              accepted.add(connection);
              try {
                // stay alive until the socket closes
                let subscription = yield* connection;
                let next = yield* subscription.next();
                while (!next.done) {
                  next = yield* subscription.next();
                }
              } finally {
                live.delete(connection);
              }
            });
          } catch (error) {
            errors.send(error);
          }
        });
        yield* each.next();
      }
    });

    // Registered after the spawns so that it runs before they are halted: the
    // going-away close has to land while each connection task is still alive.
    yield* ensure(function* () {
      // The first close wins, so 1001 takes precedence over the 1000 each
      // connection sends as its own scope exits. Snapshot the set, because
      // connections remove themselves from it as they close. Closing
      // concurrently keeps a silent peer from serializing the whole shutdown
      // into one close timeout apiece.
      yield* all(
        [...live].map((connection) =>
          connection.close(1001, "server shutting down"),
        ),
      );
      server.close();
    });

    // A queue is already a subscription, so it is the handle itself.
    yield* provide({
      next: () => accepted.next(),
      errors,
    });
  });
}
