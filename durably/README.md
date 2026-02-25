# durably

Record, replay, and resume Effection workflows with durable streams.

---

## Installation

```bash
npm install @effectionx/durably effection
```

## Usage

Wrap any Effection operation with `durably()` to record every effect
resolution to a durable stream. When resumed with the same stream, stored
results are replayed without re-executing effects, enabling mid-workflow
resume after restarts.

```ts
import { main } from "effection";
import { durably, InMemoryDurableStream } from "@effectionx/durably";
import { sleep } from "effection";

let stream = new InMemoryDurableStream();

await main(function* () {
  let result = yield* durably(function* () {
    yield* sleep(1000);
    return "hello";
  }, { stream });

  console.log(result); // "hello"
});
```

### Mid-workflow resume

Pass a stream that already contains recorded events. The workflow replays
stored results instantly, then continues live from where it left off:

```ts
import { durably, InMemoryDurableStream } from "@effectionx/durably";
import { sleep, action } from "effection";

// First run — records events to the stream
let stream = new InMemoryDurableStream();

yield* durably(function* () {
  yield* sleep(1000);    // recorded
  yield* action(function* (resolve) {
    // ... long-running work that gets interrupted
  });
}, { stream });

// Second run — replays the sleep instantly, resumes from the action
yield* durably(function* () {
  yield* sleep(1000);    // replayed from stream (instant)
  yield* action(function* (resolve) {
    resolve("done");     // executes live
  });
}, { stream });
```

### Divergence detection

If the workflow code changes between runs, mismatched effects throw a
`DivergenceError`:

```ts
import { durably, InMemoryDurableStream, DivergenceError } from "@effectionx/durably";
import { sleep, action } from "effection";

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

### `InMemoryDurableStream`

An in-memory implementation of `DurableStream`. Events are stored in an
array and lost when the process exits. Useful for testing.

- `append(event)` — add an event to the stream
- `read()` — return all stored entries

### `DurableStream` (interface)

Implement this interface to provide persistent storage:

```ts
interface DurableStream {
  append(event: DurableEvent): void;
  read(): StreamEntry[];
}
```

### `DivergenceError`

Thrown when a replayed effect's description does not match what was
recorded. Indicates the workflow code has changed between runs.

## Requirements

- Node.js >= 22
- Effection ^4 (requires [PR 1127](https://github.com/thefrontside/effection/pull/1127)
  for `effection/experimental` reducer exports)
