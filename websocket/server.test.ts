import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { describe, it } from "@effectionx/vitest";
import {
  type Operation,
  type Subscription,
  createQueue,
  resource,
  spawn,
  suspend,
  withResolvers,
} from "effection";
import { expect } from "expect";
import { WebSocketServer } from "ws";

import {
  type WebSocketServerLike,
  type WebSocketServerResource,
  useWebSocketServer,
} from "./server.ts";
import { type WebSocketResource, useWebSocket } from "./websocket.ts";

describe("WebSocketServer", () => {
  it("yields a connection and receives a message from the client", function* () {
    let { server, port } = yield* useTestServer();
    let incoming = yield* server;

    let client = yield* connect(port);
    let connection = (yield* incoming.next()).value;

    let messages = yield* connection;
    yield* client.send("hello from client");

    let { value } = yield* messages.next();
    expect(value).toMatchObject({ data: "hello from client" });
  });

  it("sends a message from a server connection to the client", function* () {
    let { server, port } = yield* useTestServer();
    let incoming = yield* server;

    let client = yield* connect(port);
    let connection = (yield* incoming.next()).value;

    let clientMessages = yield* client;
    yield* connection.send("hello from server");

    let { value } = yield* clientMessages.next();
    expect(value).toMatchObject({ data: "hello from server" });
  });

  it("completes a connection stream when its client disconnects", function* () {
    let { server, port } = yield* useTestServer();
    let incoming = yield* server;

    let raw = new WebSocket(`ws://localhost:${port}`);
    yield* useWebSocket<string>(() => raw);
    let connection = (yield* incoming.next()).value;
    let messages = yield* connection;

    raw.close();

    let event = yield* drain(messages);
    expect(event.type).toEqual("close");
    expect(event.wasClean).toEqual(true);
  });

  it("closes live client connections when the server is torn down", function* () {
    let { httpServer, port } = yield* useHttp();
    let accepted = createQueue<void, never>();

    let serverTask = yield* spawn(function* () {
      let server = yield* useWebSocketServer<string>(
        () =>
          new WebSocketServer({
            server: httpServer,
          }) as unknown as WebSocketServerLike,
      );
      let incoming = yield* server;
      yield* incoming.next();
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
  });

  it("surfaces each simultaneous client as a distinct connection", function* () {
    let { server, port } = yield* useTestServer();
    let incoming = yield* server;

    // connect two clients, then read two buffered connections back out
    let clientA = yield* connect(port);
    let clientB = yield* connect(port);

    let first = (yield* incoming.next()).value;
    let second = (yield* incoming.next()).value;

    expect(first).not.toBe(second);

    // each connection receives only its own client's message, regardless of order
    let firstMessages = yield* first;
    let secondMessages = yield* second;

    yield* clientA.send("A");
    yield* clientB.send("B");

    let received = [
      (yield* firstMessages.next()).value?.data,
      (yield* secondMessages.next()).value?.data,
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
        }) as unknown as WebSocketServerLike,
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

    try {
      yield* provide({ httpServer, port });
    } finally {
      let closed = withResolvers<void>();
      httpServer.close(() => closed.resolve());
      yield* closed.operation;
    }
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
