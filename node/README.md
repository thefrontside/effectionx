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

This package provides two sub-modules:

- `@effectionx/node/stream` - Stream utilities for Node.js
- `@effectionx/node/events` - Event utilities for Node.js EventEmitters

You can also import everything — including the `Stdio` context API —
from the main module:

```typescript
import { Stdio, fromReadable, on, once, stdin, stdout } from "@effectionx/node";
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

## Host Stdio

`Stdio` is a middleware-capable context API for the **host** process's
standard input, output, and error streams. The default handlers read
from `process.stdin` and write to `process.stdout` / `process.stderr`,
so in normal production code you just call the operations and bytes
flow as you'd expect. Install middleware with `Stdio.around({ ... })`
inside any scope to observe, transform, or redirect those bytes — useful
for tests that assert what a program wrote to stdout, or harnesses that
feed synthesized input to code reading from stdin.

This is distinct from `@effectionx/process`'s `Stdio`, which governs
**child**-process stdio.

### Writing to stdout / stderr

`stdout` and `stderr` are `(bytes: Uint8Array) => Operation<void>`
operations destructured from `Stdio.operations` and re-exported at the
package root, so you can use them directly:

```typescript
import { main } from "effection";
import { stderr, stdout } from "@effectionx/node";

await main(function* () {
  yield* stdout(new TextEncoder().encode("hello\n"));
  yield* stderr(new TextEncoder().encode("oops\n"));
});
```

### Reading stdin

`stdin()` returns a `Stream<Uint8Array, void>` sourced from
`process.stdin`. A single `yield*` gives you a subscription you can
iterate, or use `each` for a `for`-loop:

```typescript
import { each, main } from "effection";
import { stdin, stdout } from "@effectionx/node";

await main(function* () {
  // echo every chunk back to stdout
  for (const chunk of yield* each(stdin())) {
    yield* stdout(chunk);
    yield* each.next();
  }
});
```

### Intercepting with middleware

Middleware is registered per scope via `Stdio.around(...)`. Each member
is a function `(args, next) => TReturn` where delegation to the next
link (including the default handler) is `next(...args)`. Middleware
applies to the current scope and its descendants until they exit.

```typescript
import { main } from "effection";
import { Stdio, stdout } from "@effectionx/node";

await main(function* () {
  const captured: Uint8Array[] = [];

  yield* Stdio.around({
    *stdout(args, next) {
      captured.push(args[0]);
      return yield* next(...args); // delegate so bytes still reach process.stdout
    },
  });

  yield* stdout(new TextEncoder().encode("hello\n"));
  // `captured` holds the bytes, and they also reached the terminal
});
```

To **redirect** without reaching the default handler, simply don't call
`next`:

```typescript
yield* Stdio.around({
  *stdout(args, _next) {
    captured.push(args[0]);
    // no call to next → nothing is written to process.stdout
  },
});
```

### Substituting stdin

Because `stdin()` returns a `Stream` directly, a `stdin` middleware is
a plain function that returns a replacement stream — useful for
feeding a synthetic input sequence from a test:

```typescript
import { createSignal, each, main } from "effection";
import { Stdio, stdin } from "@effectionx/node";

await main(function* () {
  const signal = createSignal<Uint8Array, void>();

  yield* Stdio.around({
    stdin(_args, _next) {
      return signal;
    },
  });

  // From elsewhere in your test, drive the stream:
  //   signal.send(new TextEncoder().encode("line 1\n"));
  //   signal.close();

  for (const chunk of yield* each(stdin())) {
    // ...handle synthesized input
    yield* each.next();
  }
});
```

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
