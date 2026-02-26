# @effectionx/durable

Durable-native structured concurrency primitives with replay guarantees for Effection.

---

## What is durable-native?

`@effectionx/durable` provides structured concurrency primitives (`spawn`, `all`, `race`, `resource`, `scoped`) that are durable by default. Every effect resolution is recorded to a stream. On restart, stored results are replayed without re-executing effects, enabling mid-workflow resume.

This is intentionally **not** API-compatible with plain Effection `Operation` usage. It defines a branded `DurableOperation<T>` type that enforces durable boundaries at the type level.

## Usage

```typescript
import { durable, InMemoryDurableStream } from "@effectionx/durable";
import { sleep } from "effection";

let stream = new InMemoryDurableStream();

await durable(function*() {
  yield* sleep(1000);
  return "hello";
}, { stream });
```

## Event Schema

The durable stream uses a 4-event protocol:

| Event | Direction | Purpose |
|-------|-----------|---------|
| `yield` | Outbound | Coroutine yielded an effect |
| `next` | Inbound | Outside world responded to a yield |
| `close` | Terminal | Coroutine reached final state (ok/err/cancelled) |
| `spawn` | Structural | Coroutine spawned a child |

All coroutines in a workflow write to a single flat stream. The stream URL is the workflow identity; the stream offset is the checkpoint.

## Runtime Invariants

1. **Spawn registration**: A `spawn` event is appended before the child begins execution.
2. **Halt persistence**: A `close(cancelled)` event is appended before scope teardown completes.
3. **Resource determinism**: Replay does not re-acquire already-recorded acquisitions.
4. **All completeness**: All branch close events are recorded before the join resolution.
5. **Race cancellation**: Winner's `close(ok)` is followed by `close(cancelled)` for each loser.
6. **Replay suppression**: Recorded effects never call live `effect.enter()` during replay.
7. **Single-stream transactionality**: One stream, one offset, one checkpoint per workflow.

## Public API

- `durable(op, options?)` — run a durable operation with recording/replay
- `spawn(op)` — spawn a durable child coroutine
- `all(ops)` — wait for all durable operations
- `race(ops)` — race durable operations
- `resource(factory)` — define a durable resource
- `scoped(op)` — encapsulate a durable operation
- `InMemoryDurableStream` — in-memory stream for development/testing
- `DivergenceError` — thrown when replay detects execution divergence

## Type Model

`DurableOperation<T>` is a branded `Operation<T>` — it works with `yield*` but prevents accidental assignment from plain operations. Only the durable runtime can mint branded operations.
