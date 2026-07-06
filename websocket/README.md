# WebSocket

A streamlined [WebSocket][websocket] client for Effection programs that
transforms the event-based WebSocket API into a clean, resource-oriented stream.

## Why Use this API?

Traditional WebSocket API require managing multiple event handlers (`open`,
`close`, `error`, `message`) which can become complex and error-prone.

This package simplifies WebSocket usage by:

- Providing a clean stream-based interface
- Handling connection state management automatically
- Implementing proper error handling
- Ensuring resource cleanup

## Basic Usage

```typescript
import { each, main } from "effection";
import { useWebSocket } from "@effectionx/websocket";

await main(function* () {
  // Connection is guaranteed to be open when this returns
  let socket = yield* useWebSocket("ws://websocket.example.org");

  // Send messages to the server
  yield* socket.send("Hello World");

  // Receive messages using a simple iterator
  for (let message of yield* each(socket)) {
    console.log("Message from server", message);
    yield* each.next();
  }
});
```

## Features

- **Ready-to-use Connections**: `useWebSocket()` returns only after the
  connection is established
- **Automatic Error Handling**: Socket errors are properly propagated to your
  error boundary
- **Stream-based API**: Messages are delivered through a simple stream interface
- **Clean Resource Management**: Connections are properly cleaned up when the
  operation completes

## WebSocket Server

`useWebSocketServer()` is the server counterpart of `useWebSocket()`. It yields a
stream of incoming connections, where **each connection is the same full-duplex
`WebSocketResource`** produced by the client — you receive messages by iterating
it and reply with `yield* connection.send()`.

The underlying server is supplied through a factory, so this package never
imports a concrete server implementation and stays platform-agnostic. On Node
this is typically the [`ws`](https://github.com/websockets/ws) `WebSocketServer`.

```typescript
import { each, main, spawn } from "effection";
import { WebSocketServer } from "ws";
import {
  useWebSocketServer,
  type WebSocketServerLike,
} from "@effectionx/websocket";

await main(function* () {
  let server = yield* useWebSocketServer<string>(
    () => new WebSocketServer({ port: 3000 }) as unknown as WebSocketServerLike,
  );

  // A stream is consumed sequentially, so spawn a handler per connection to
  // serve many clients concurrently.
  for (let connection of yield* each(server)) {
    yield* spawn(function* () {
      for (let message of yield* each(connection)) {
        yield* connection.send(`echo: ${message.data}`);
        yield* each.next();
      }
    });
    yield* each.next();
  }
});
```

A client — using `useWebSocket()` from the same package — pairs with it directly.
Because `send` is an `Operation`, invoke it with `yield*` on both sides:

```typescript
import { each, main } from "effection";
import { useWebSocket } from "@effectionx/websocket";

await main(function* () {
  let socket = yield* useWebSocket<string>("ws://localhost:3000");

  yield* socket.send("hello"); // client -> server

  for (let message of yield* each(socket)) {
    console.log(message.data); // "echo: hello"  (server -> client)
    yield* each.next();
  }
});
```

Connections are buffered, so none are dropped between the moment the server
starts listening and the moment you begin iterating. The server — and every live
connection it produced — is automatically closed when the resource passes out of
scope.

## Advanced Usage

### Custom WebSocket Implementations

For environments without native WebSocket support (like Node.js < 21), you can
provide your own WebSocket implementation:

```typescript
import { createWebSocket } from "my-websocket-client";
import { each, main } from "effection";
import { useWebSocket } from "@effectionx/websocket";

await main(function* () {
  let socket = yield* useWebSocket(() =>
    createWebSocket("ws://websocket.example.org")
  );

  for (let message of yield* each(socket)) {
    console.log("Message from server", message);
    yield* each.next();
  }
});
```

[websocket]: https://developer.mozilla.org/en-US/docs/Web/API/WebSocket
