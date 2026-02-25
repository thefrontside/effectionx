# durably

Record, replay, and resume Effection workflows with
[Durable Streams](https://github.com/durable-streams/durable-streams).

---

## Installation

```bash
npm install @effectionx/durably effection
```

For HTTP-backed persistent streams, also install the Durable Streams client:

```bash
npm install @durable-streams/client
```

## Usage

Wrap any Effection operation with `durably()` to record every effect
resolution to a durable stream. When resumed with the same stream, stored
results are replayed without re-executing effects, enabling mid-workflow
resume after restarts.

```ts
import { main, sleep } from "effection";
import { durably } from "@effectionx/durably";
import { useDurableStream } from "@effectionx/durably/http";

const STREAM_URL = "http://localhost:4437/my-workflow";

await main(function* () {
  let stream = yield* useDurableStream(STREAM_URL);

  let result = yield* durably(function* () {
    yield* sleep(1000);
    return "hello";
  }, { stream });

  console.log(result); // "hello"
});
```

Run this twice: the first run records `sleep(1000)` to the server. The
second run replays it instantly and returns `"hello"` without waiting.

### Mid-workflow resume

Interrupt a workflow mid-execution (Ctrl+C, process crash, deployment),
then run the same code again. Completed effects replay instantly from the
stream; execution resumes live from the point of interruption:

```ts
import { main, sleep, call } from "effection";
import { durably } from "@effectionx/durably";
import { useDurableStream } from "@effectionx/durably/http";

await main(function* () {
  let stream = yield* useDurableStream("http://localhost:4437/pipeline");

  yield* durably(function* () {
    // Step 1: fetch data (recorded)
    let data = yield* call(async () => {
      let res = await fetch("https://api.example.com/items");
      return res.json();
    });

    // Step 2: process each item (2s each — interrupt here)
    for (let item of data) {
      yield* sleep(2000);
      yield* call(async () => processItem(item));
    }

    // Step 3: aggregate
    yield* sleep(1000);
    console.log("pipeline complete");
  }, { stream });
});
```

### Divergence detection

If the workflow code changes between runs, mismatched effects throw a
`DivergenceError`:

```ts
import { main, sleep, action } from "effection";
import { durably, InMemoryDurableStream, DivergenceError } from "@effectionx/durably";

await main(function* () {
  let stream = new InMemoryDurableStream();

  // First run records sleep(100)
  yield* durably(function* () {
    yield* sleep(100);
    return "v1";
  }, { stream });

  // Second run yields action() where sleep(100) was expected
  try {
    yield* durably(function* () {
      yield* action(function* (resolve) { resolve("v2"); });
    }, { stream });
  } catch (error) {
    // DivergenceError: expected "sleep(100)" but got "action"
  }
});
```

### Testing with in-memory streams

For tests, use `InMemoryDurableStream` — no server required:

```ts
import { main, sleep } from "effection";
import { durably, InMemoryDurableStream } from "@effectionx/durably";

await main(function* () {
  let stream = new InMemoryDurableStream();

  yield* durably(function* () {
    yield* sleep(100);
    return 42;
  }, { stream });

  // Stream captured all events
  let events = stream.read().map(e => e.event);
  console.log(events);
});
```

## How it works

Effection's architecture routes every effect through a single **Reducer**.
`durably()` injects a **DurableReducer** that intercepts this point:

- **Recording**: When a generator yields an effect, the reducer writes
  `effect:yielded` to the stream. When it resolves, `effect:resolved`.
  Scope lifecycle events (`scope:created`, `scope:destroyed`) are also
  recorded.

- **Replay**: When the stream already has events, the reducer feeds stored
  results back to generators via `iterator.next(storedResult)` without
  calling `effect.enter()`. The generator cannot tell whether it is
  replaying or running live.

- **Transition**: When stored events run out, the reducer seamlessly
  switches to live execution. All subsequent effects are recorded normally.

Only user-facing effects (`action`, `sleep`, `spawn`, `resource`, etc.) are
recorded. Infrastructure effects (`useCoroutine`, `useScope`, context
mutations) always execute live.

## API

### `durably(operation, options?)`

Execute an operation with durable execution semantics. Returns a `Task<T>`.

- `operation` — a function returning an `Operation<T>`
- `options.stream` — a `DurableStream` for persistence (defaults to an
  ephemeral `InMemoryDurableStream`)

### `useDurableStream(url)`

*Exported from `@effectionx/durably/http`*

An Effection [resource](https://frontside.com/effection/docs/resources) that
connects to a [Durable Streams](https://github.com/durable-streams/durable-streams)
server and provides an `HttpDurableStream`.

On creation:
1. Connects to the remote stream (creates it if it doesn't exist)
2. Pre-fetches existing events for replay
3. Returns an `HttpDurableStream` that buffers locally and replicates
   writes to the server via an `IdempotentProducer`

On cleanup (when the enclosing scope exits):
- Flushes all pending writes to the server
- Detaches the producer
- Does **not** delete the remote stream — it stays open for future resume

Requires `@durable-streams/client` as a peer dependency.

### `InMemoryDurableStream`

An in-memory implementation of `DurableStream`. Events are stored in an
array and lost when the process exits. Useful for testing.

- `append(event)` — add an event to the stream
- `read(fromOffset?)` — return all stored entries from the given offset
- `length` — number of entries
- `closed` / `close()` — stream lifecycle

### `DurableStream` (interface)

Implement this interface to provide your own persistent storage:

```ts
interface DurableStream {
  append(event: DurableEvent): number;
  read(fromOffset?: number): StreamEntry[];
  length: number;
  closed: boolean;
  close(): void;
}
```

### `DivergenceError`

Thrown when a replayed effect's description does not match what was
recorded. Indicates the workflow code has changed between runs.

## Requirements

- Node.js >= 22
- Effection ^4 (requires [PR 1127](https://github.com/thefrontside/effection/pull/1127)
  for `effection/experimental` reducer exports)
- `@durable-streams/client` >= 0.1.0 (optional — only needed for
  `@effectionx/durably/http`)
