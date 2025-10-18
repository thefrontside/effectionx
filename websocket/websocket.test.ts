import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import {
  createQueue,
  type Operation,
  resource,
  type Subscription,
  suspend,
  useScope,
  withResolvers,
} from "effection";
import { createServer } from "node:http";
import { type WebSocket as WsWebSocket, WebSocketServer } from "ws";

import { useWebSocket, type WebSocketResource } from "./websocket.ts";

describe("WebSocket", () => {
  it("can send messages from the client to the server", function* () {
    let [client, server] = yield* useTestingPair();

    let subscription = yield* server.socket;

    client.socket.send("hello from client");

    let { value } = yield* subscription.next();

    expect(value).toMatchObject({ data: "hello from client" });
  });

  it("can send messages from the server to the client", function* () {
    let [client, server] = yield* useTestingPair();

    let subscription = yield* client.socket;

    server.socket.send("hello from server");

    let { value } = yield* subscription.next();

    expect(value).toMatchObject({ data: "hello from server" });
  });

  it("closes the client when the server closes", function* () {
    let [client, server] = yield* useTestingPair();
    let messages = yield* client.socket;

    server.close();

    let event = yield* drain(messages);

    expect(event.type).toEqual("close");
    expect(event.wasClean).toEqual(true);
  });

  it("closes the server when the client closes", function* () {
    let [client, server] = yield* useTestingPair();
    let messages = yield* server.socket;

    client.close();

    let event = yield* drain(messages);

    expect(event.type).toEqual("close");
    expect(event.wasClean).toEqual(true);
  });
});

export interface TestSocket {
  close(): void;
  socket: WebSocketResource<unknown>;
}

export interface TestingPairOptions {
  fail?: Response;
}

function useTestingPair(_options: TestingPairOptions = {}): Operation<
  [TestSocket, TestSocket]
> {
  return resource(function* (provide) {
    let sockets = createQueue<TestSocket, never>();

    let scope = yield* useScope();

    const httpServer = createServer();
    const wss = new WebSocketServer({ server: httpServer });

    wss.on("connection", (ws: WsWebSocket) =>
      scope.run(function* () {
        // The ws library WebSocket is already open, so we need to manually emit 'open' event
        // Since useWebSocket waits for 'open', we emit it asynchronously
        queueMicrotask(() => {
          ws.emit("open");
        });
        const socket = yield* useWebSocket(() => ws);
        sockets.add({
          close: () => ws.close(),
          socket,
        });
        yield* suspend();
      }));

    const listening = withResolvers<void>();
    httpServer.listen(9901, listening.resolve);
    yield* listening.operation;

    const port = 9901;

    let client = new WebSocket(`ws://localhost:${port}`);

    let next = yield* sockets.next();

    let local = {
      close: () => client.close(),
      socket: yield* useWebSocket(() => client),
    };

    let remote = next.value;

    try {
      yield* provide([local, remote]);
    } finally {
      wss.close();
      const closed = withResolvers<void>();
      httpServer.close(() => closed.resolve());
      yield* closed.operation;
    }
  });
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
