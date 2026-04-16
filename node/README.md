# Node

Node.js-specific utilities for Effection programs. This package provides
adapters for working with Node.js streams and event emitters using structured
concurrency.

---

## Installation

```bash
npm install @effectionx/node
```

## Modules

This package provides three sub-modules:

- `@effectionx/node/stream` - Stream utilities for Node.js
- `@effectionx/node/events` - Event utilities for Node.js EventEmitters
- `@effectionx/node/stdio` - Host process stdio middleware seam

You can also import everything from the main module:

```typescript
import { fromReadable, on, once, Stdio, stdin, stdout, stderr } from "@effectionx/node";
```

## Stream Utilities

### fromReadable()

Convert a Node.js Readable stream to an Effection Stream.

```typescript
import fs from "node:fs";
import { each, main } from "effection";
import { fromReadable } from "@effectionx/node/stream";

await main(function* () {
  const fileStream = fs.createReadStream("./data.txt");

  for (const chunk of yield* each(fromReadable(fileStream))) {
    console.log(new TextDecoder().decode(chunk));
    yield* each.next();
  }
});
```

The returned stream emits `Uint8Array` chunks and automatically cleans up
event listeners when the stream is closed or the operation is shut down.

## Event Utilities

### on()

Create a Stream of events from any EventEmitter or EventTarget-like object.

This works with:
- Node.js EventEmitters (using `on`/`off`)
- DOM EventTargets (using `addEventListener`/`removeEventListener`)
- Web Worker's global `self` object

```typescript
import { each, main } from "effection";
import { on } from "@effectionx/node/events";

await main(function* () {
  // With Node.js EventEmitter
  for (const [chunk] of yield* each(on(stream, "data"))) {
    console.log("data:", chunk);
    yield* each.next();
  }

  // In a worker thread (EventTarget style)
  for (const [event] of yield* each(on(self, "message"))) {
    console.log("received:", event.data);
    yield* each.next();
  }
});
```

For EventEmitters, events are emitted as arrays of arguments.
For EventTargets, events are emitted as single-element arrays containing the
event object.

### once()

Create an Operation that yields the next event to be emitted by an EventEmitter
or EventTarget-like object.

```typescript
import { main } from "effection";
import { once } from "@effectionx/node/events";

await main(function* () {
  // Wait for a single message (EventTarget style)
  const [event] = yield* once(self, "message");
  console.log(event.data);

  // Wait for a single event (EventEmitter style)
  const [code] = yield* once(process, "exit");
  console.log("Process exited with code:", code);
});
```

## Host Stdio

`Stdio` is a [`createApi`][context-api] middleware seam over the host process's
`stdin`, `stdout`, and `stderr`. By default, `stdout` and `stderr` write bytes
to `process.stdout` / `process.stderr`, and `stdin` returns a readable Effection
stream sourced from `process.stdin`. Middleware can wrap these operations via
`Stdio.around(...)` to capture, transform, or substitute the bytes without
touching the call sites.

[context-api]: ../context-api/README.md

### stdout()

Write bytes to the host process's standard output.

```typescript
import { main } from "effection";
import { stdout } from "@effectionx/node/stdio";

await main(function* () {
  yield* stdout(new TextEncoder().encode("hello\n"));
});
```

### stderr()

Write bytes to the host process's standard error.

```typescript
import { main } from "effection";
import { stderr } from "@effectionx/node/stdio";

await main(function* () {
  yield* stderr(new TextEncoder().encode("something went wrong\n"));
});
```

### stdin()

Yield an Effection `Stream<Uint8Array, void>` of bytes read from the host
process's standard input.

```typescript
import { each, main } from "effection";
import { stdin } from "@effectionx/node/stdio";

await main(function* () {
  for (const chunk of yield* each(stdin())) {
    console.log(new TextDecoder().decode(chunk));
    yield* each.next();
  }
});
```

### Stdio.around()

Install middleware that intercepts any of the three operations for the current
scope. The example below captures every byte written to `stdout` into an
in-memory buffer instead of forwarding it to the host.

```typescript
import { main } from "effection";
import { Stdio, stdout } from "@effectionx/node/stdio";

await main(function* () {
  const captured: Uint8Array[] = [];

  yield* Stdio.around({
    *stdout([bytes]) {
      captured.push(bytes);
    },
  });

  yield* stdout(new TextEncoder().encode("hello\n"));
  // captured now holds the bytes; nothing was written to process.stdout
});
```

`@effectionx/process` pipes child-process output through these same operations,
so installing an `Stdio.around(...)` in an outer scope also intercepts child
process stdio from any nested `exec` calls.

## TypeScript Support

All exports include TypeScript type definitions. The event functions support
generic type parameters for type-safe event handling:

```typescript
import { once, on } from "@effectionx/node/events";

// Type the event arguments
const [code] = yield* once<[number]>(process, "exit");

// Type the stream events
for (const [data] of yield* each(on<[Buffer]>(stream, "data"))) {
  // data is typed as Buffer
  yield* each.next();
}
```

## Interfaces

The event utilities work with any object that implements these interfaces:

```typescript
// Node.js EventEmitter style
interface EventEmitterLike {
  on(event: string, listener: (...args: unknown[]) => void): void;
  off(event: string, listener: (...args: unknown[]) => void): void;
}

// DOM EventTarget style
interface EventTargetLike {
  addEventListener(event: string, listener: (event: unknown) => void): void;
  removeEventListener(event: string, listener: (event: unknown) => void): void;
}
```
