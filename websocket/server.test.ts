import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { timebox } from "@effectionx/timebox";
import { describe, it } from "@effectionx/vitest";
import {
  type Operation,
  type Subscription,
  createQueue,
  ensure,
  resource,
  scoped,
  sleep,
  spawn,
  suspend,
  withResolvers,
} from "effection";
import { expect } from "expect";
import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";

import {
  type WebSocketServerLike,
  type WebSocketServerResource,
  useWebSocketServer,
} from "./server.ts";
import { type WebSocketResource, useWebSocket } from "./websocket.ts";

describe("WebSocketServer", () => {
  it("yields a connection and receives a message from the client", function* () {
    let { server, port } = yield* useTestServer();

    let client = yield* connect(port);
    let connection = (yield* server.next()).value;

    let messages = yield* connection;
    yield* client.send("hello from client");

    let { value } = yield* messages.next();
    expect(value).toMatchObject({ data: "hello from client" });
  });

  it("sends a message from a server connection to the client", function* () {
    let { server, port } = yield* useTestServer();

    let client = yield* connect(port);
    let connection = (yield* server.next()).value;

    let clientMessages = yield* client;
    yield* connection.send("hello from server");

    let { value } = yield* clientMessages.next();
    expect(value).toMatchObject({ data: "hello from server" });
  });

  it("completes a connection stream when its client disconnects", function* () {
    let { server, port } = yield* useTestServer();

    let raw = new WebSocket(`ws://localhost:${port}`);
    yield* useWebSocket<string>(() => raw);
    let connection = (yield* server.next()).value;
    let messages = yield* connection;

    raw.close(4001, "goodbye");

    let event = yield* drain(messages);
    expect(event.type).toEqual("close");
    expect(event.wasClean).toEqual(true);
    expect(event.code).toEqual(4001);
    expect(event.reason).toEqual("goodbye");
  });

  it("closes live client connections when the server is torn down", function* () {
    let { httpServer, port } = yield* useHttp();
    let accepted = createQueue<void, never>();

    let serverTask = yield* spawn(function* () {
      let server = yield* useWebSocketServer<string>(
        () =>
          new WebSocketServer({
            server: httpServer,
          }),
      );
      yield* server.next();
      accepted.add();
      yield* suspend();
    });

    let client = yield* connect(port);
    let messages = yield* client;

    // wait until the server has accepted the connection before tearing it down
    yield* accepted.next();
    yield* serverTask.halt();

    let event = yield* drain(messages);
    expect(event.type).toEqual("close");
    expect(event.wasClean).toEqual(true);
    expect(event.code).toEqual(1001);
    expect(event.reason).toEqual("server shutting down");
  });

  it("closes every live connection when the server is torn down", function* () {
    let { httpServer, port } = yield* useHttp();
    let accepted = createQueue<void, never>();

    let serverTask = yield* spawn(function* () {
      let server = yield* useWebSocketServer<string>(
        () => new WebSocketServer({ server: httpServer }),
      );
      yield* server.next();
      yield* server.next();
      accepted.add();
      yield* suspend();
    });

    let clients = [yield* connect(port), yield* connect(port)];
    let inboxes = [yield* clients[0], yield* clients[1]];

    // both connections are established, so both belong to the live roster
    yield* accepted.next();
    yield* serverTask.halt();

    for (let inbox of inboxes) {
      let event = yield* drain(inbox);
      expect(event.code).toEqual(1001);
      expect(event.reason).toEqual("server shutting down");
      expect(event.wasClean).toEqual(true);
    }
  });

  it("does not complete teardown until the server has finished closing", function* () {
    // this server never invokes its close callback until released, standing in
    // for one with connections still winding down
    let server = makeFakeServer({ deferClose: true });
    let finished = createQueue<void, never>();

    yield* spawn(function* () {
      yield* scoped(function* () {
        yield* useWebSocketServer<string>(() => server);
      });
      finished.add();
    });

    // the scope body is done, so teardown has asked the server to close
    yield* sleep(0);
    expect(server.closeCalls).toEqual(1);

    // ...but teardown is still pending, because the callback has not fired
    let early = yield* timebox(100, () => finished.next());
    expect(early.timeout).toEqual(true);

    server.releaseClose();

    let late = yield* timebox(1_000, () => finished.next());
    expect(late.timeout).toEqual(false);
  });

  it("bounds teardown when peers never answer the close handshake", function* () {
    let server = makeFakeServer();
    let sockets = [makeSilentSocket(), makeSilentSocket(), makeSilentSocket()];

    let outcome = yield* timebox(2_000, () =>
      scoped(function* () {
        let connections = yield* useWebSocketServer<string>(() => server, {
          closeTimeout: 10,
        });
        // emit once the accept loop is subscribed, which a real server's I/O
        // guarantees but a hand-driven emitter does not
        yield* spawn(function* () {
          yield* sleep(0);
          for (let socket of sockets) {
            server.emit("connection", socket);
          }
        });
        for (let _ of sockets) {
          yield* connections.next();
        }
      }),
    );

    // leaving the scope closed all three without waiting on a reply that never
    // comes, rather than hanging on the first silent peer
    expect(outcome.timeout).toEqual(false);
    expect(sockets.map((socket) => socket.closeCalls)).toEqual([1, 1, 1]);
    // the going-away close won, so the scope-exit 1000 was a no-op
    expect(sockets.map((socket) => socket.codes)).toEqual([
      [1001],
      [1001],
      [1001],
    ]);
    expect(server.closeCalls).toEqual(1);
  });

  it("closes a connection with an explicit code and reason", function* () {
    let { server, port } = yield* useTestServer();

    let client = yield* connect(port);
    let connection = (yield* server.next()).value;
    let clientMessages = yield* client;

    yield* connection.close(4002, "custom");

    let event = yield* drain(clientMessages);
    expect(event.code).toEqual(4002);
    expect(event.reason).toEqual("custom");
  });

  it("buffers a connection that arrives before it is consumed", function* () {
    let { server, port } = yield* useTestServer();

    // connect the client before reading any connection
    let client = yield* connect(port);

    // the connection was buffered before anybody read it
    let connection = (yield* server.next()).value;

    let messages = yield* connection;
    yield* client.send("buffered hello");

    let { value } = yield* messages.next();
    expect(value).toMatchObject({ data: "buffered hello" });
  });

  it("isolates a connection error so the server keeps serving other clients", function* () {
    let { httpServer, port } = yield* useHttp();

    // capture the raw accepted sockets so we can force an error on one
    let wss = new WebSocketServer({ server: httpServer });
    let rawSockets = createQueue<WsWebSocket, never>();
    wss.on("connection", (ws) => rawSockets.add(ws));

    let server = yield* useWebSocketServer<string>(() => wss);
    let serverErrors = yield* server.errors;

    // accept one client, then make its underlying socket error
    yield* connect(port);
    yield* server.next();
    let raw = (yield* rawSockets.next()).value;
    raw.emit("error", new Error("boom"));

    // the failure is surfaced on the errors stream, not thrown at the server
    let { value: error } = yield* serverErrors.next();
    expect(socketErrorEvent(error).message).toContain("boom");

    // and the server survives, serving a fresh client
    let client = yield* connect(port);
    let connection = (yield* server.next()).value;
    let messages = yield* connection;
    yield* client.send("still alive");
    let { value } = yield* messages.next();
    expect(value).toMatchObject({ data: "still alive" });
  });

  it("surfaces each simultaneous client as a distinct connection", function* () {
    let { server, port } = yield* useTestServer();

    // connect two clients, then read two buffered connections back out
    let clientA = yield* connect(port);
    let clientB = yield* connect(port);

    let first = (yield* server.next()).value;
    let second = (yield* server.next()).value;

    expect(first).not.toBe(second);

    // each connection receives only its own client's message, regardless of order
    let firstMessages = yield* first;
    let secondMessages = yield* second;

    yield* clientA.send("A");
    yield* clientB.send("B");

    let received = [
      ((yield* firstMessages.next()).value as MessageEvent<string>).data,
      ((yield* secondMessages.next()).value as MessageEvent<string>).data,
    ].sort();

    expect(received).toEqual(["A", "B"]);
  });
});

interface TestServer {
  server: WebSocketServerResource<string>;
  port: number;
}

function useTestServer(): Operation<TestServer> {
  return resource(function* (provide) {
    let { httpServer, port } = yield* useHttp();

    let server = yield* useWebSocketServer<string>(
      () =>
        new WebSocketServer({
          server: httpServer,
        }),
    );

    yield* provide({ server, port });
  });
}

function useHttp(): Operation<{
  httpServer: ReturnType<typeof createServer>;
  port: number;
}> {
  return resource(function* (provide) {
    let httpServer = createServer();

    let listening = withResolvers<void>();
    httpServer.listen(0, listening.resolve);
    yield* listening.operation;

    let port = (httpServer.address() as AddressInfo).port;

    yield* ensure(function* () {
      let closed = withResolvers<void>();
      httpServer.close(() => closed.resolve());
      yield* closed.operation;
    });

    yield* provide({ httpServer, port });
  });
}

/**
 * A server we drive by hand, so a test can hand {@link useWebSocketServer}
 * sockets that a real peer would never produce.
 */
function makeFakeServer({ deferClose = false }: { deferClose?: boolean } = {}) {
  let pending: (() => void) | undefined;
  return Object.assign(new EventEmitter(), {
    closeCalls: 0,
    close(callback?: () => void) {
      this.closeCalls += 1;
      if (deferClose) {
        pending = callback;
      } else {
        callback?.();
      }
    },
    /** Fire a close callback that `deferClose` withheld. */
    releaseClose() {
      pending?.();
    },
  }) as unknown as EventEmitter &
    WebSocketServerLike & { closeCalls: number; releaseClose(): void };
}

/**
 * An accepted socket that is already open and never emits `open`, `close`, or
 * `error` — a peer that takes a close frame and never answers it. `close()`
 * only takes effect while the socket is open, like a real one, so a second
 * close is the no-op the "first close wins" rule depends on.
 */
function makeSilentSocket() {
  return {
    readyState: WebSocket.OPEN as number,
    binaryType: "blob" as BinaryType,
    bufferedAmount: 0,
    extensions: "",
    protocol: "",
    url: "ws://silent.test",
    closeCalls: 0,
    codes: [] as number[],
    addEventListener() {},
    removeEventListener() {},
    send() {},
    close(code?: number) {
      if (this.readyState !== WebSocket.OPEN) {
        return;
      }
      this.readyState = WebSocket.CLOSING;
      this.closeCalls += 1;
      this.codes.push(code ?? 1000);
    },
  };
}

/**
 * A socket failure throws the DOM `error` event, which is not an `Error`.
 * Effection 4.1 and later box such a value in a `ThrownValueError` that keeps
 * the original on `cause`, while earlier versions publish the event itself, and
 * this package supports both.
 */
function socketErrorEvent(error: unknown): ErrorEvent {
  return (
    error instanceof Error && error.cause ? error.cause : error
  ) as ErrorEvent;
}

function* connect(port: number): Operation<WebSocketResource<string>> {
  return yield* useWebSocket<string>(
    () => new WebSocket(`ws://localhost:${port}`),
  );
}

function* drain<T, TClose>(
  subscription: Subscription<T, TClose>,
): Operation<TClose> {
  let next = yield* subscription.next();
  while (!next.done) {
    next = yield* subscription.next();
  }
  return next.value;
}
