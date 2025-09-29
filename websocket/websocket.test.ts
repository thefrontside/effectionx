import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import {
  call,
  createQueue,
  type Operation,
  resource,
  type Subscription,
  suspend,
  useScope,
} from "effection";

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

function useTestingPair({ fail }: TestingPairOptions = {}): Operation<
  [TestSocket, TestSocket]
> {
  return resource(function* (provide) {
    let sockets = createQueue<TestSocket, never>();

    let scope = yield* useScope();

    let server = yield* call(() =>
      Deno.serve(
        {
          port: 9901,
          onListen() {},
        },
        (req) => {
          if (req.headers.get("upgrade") != "websocket") {
            return new Response(null, { status: 501 });
          } else if (fail) {
            return fail;
          }
          const { socket, response } = Deno.upgradeWebSocket(req);

          scope.run(function* () {
            sockets.add({
              close: () => socket.close(),
              socket: yield* useWebSocket(() => socket),
            });
            yield* suspend();
          });

          return response;
        },
      )
    );

    let client = new WebSocket(
      `ws://localhost:${server.addr.port}`,
    );

    let next = yield* sockets.next();

    let local = {
      close: () => client.close(),
      socket: yield* useWebSocket(() => client),
    };

    let remote = next.value;

    try {
      yield* provide([local, remote]);
    } finally {
      yield* call(() => server.shutdown());
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
