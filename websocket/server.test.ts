import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "@effectionx/vitest";
import {
  type Operation,
  type Subscription,
  createQueue,
  ensure,
  resource,
  spawn,
  suspend,
  withResolvers,
} from "effection";
import { expect } from "expect";
import { WebSocketServer, type WebSocket as WsWebSocket } from "ws";

import { type WebSocketServerResource, useWebSocketServer } from "./server.ts";
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

    // the failure is surfaced on the errors stream, not thrown at the server.
    // A socket failure surfaces as the DOM `error` event, whose message is the
    // underlying error's message.
    let { value: error } = yield* serverErrors.next();
    expect((error as ErrorEvent).message).toContain("boom");

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
