# Durable Streams as a durable execution log backend

**Durable Streams provides a strong but not perfect fit for backing a generator-based durable execution log.** The protocol's append-only semantics, monotonic opaque offsets, idempotent producer model with epoch-based zombie fencing, and "catch up then tail" read pattern align well with the core invariants of a Yield/Close event journal. Two critical gaps require application-layer mitigation: the protocol defines durability as a *logical contract* without prescribing fsync or replication, meaning "persist-before-resume" depends entirely on your server implementation; and there is no multi-event atomic append, so causal ordering of Close events relative to parent yields must be enforced by the client through sequencing discipline rather than transactional batches. The protocol emerged from 1.5 years of production use at ElectricSQL for Postgres sync and was publicly released in December 2025 (v0.2.0 shipped January 2026 with idempotent producers).

---

## A. Protocol guarantees map cleanly to execution log requirements

**Ordered append with monotonic offsets.** Every append to a Durable Stream returns a `Stream-Next-Offset` header containing an opaque, lexicographically sortable token. Offsets are server-generated, strictly monotonically increasing, and immutable by position — bytes at a given offset never change. The protocol mandates that servers serialize validation and append operations per `(stream, producerId)` pair, preventing out-of-order request arrival from corrupting sequence ordering.

**Prefix-closure with no gaps.** The append-only model inherently provides prefix-closure: reads from any offset return a contiguous sequence of all bytes appended after that position. There is no mechanism to insert, delete, or reorder entries mid-stream. Combined with the durability contract — "once written and acknowledged, bytes persist until the stream is deleted or expired" — this means any acknowledged prefix is permanently sealed.

**Concurrent readers see a consistent, ordered view.** Multiple readers can consume the same stream simultaneously from different offsets. All read modes (catch-up, long-poll, SSE) deliver data in identical order — the conformance test suite explicitly verifies "streaming equivalence" between SSE and long-poll output. Readers never observe partial appends; each append is atomic at the HTTP request level.

**Failure modes to design around.** Partial writes during crash are the primary concern. The IMPLEMENTATION_TESTING.md document (drawn from 120 days of reliability hardening at ElectricSQL, fixing 200+ bugs) identifies these critical failure modes: incomplete chunk writes where the server crashes mid-append, partial disk flushes where in-memory state diverges from persisted state, and corrupted chunk files. Implementations should roll back to the last valid boundary on recovery. For the idempotent producer, non-atomic stores have a crash window between persisting the append and updating producer state — the spec explicitly acknowledges this and recommends epoch-bumping as recovery. Retries with duplicate `(producerId, epoch, seq)` tuples return **204 No Content** (idempotent success), making client retries safe within an epoch.

**"Catch up then tail" is a first-class pattern.** A reader issues `GET ?offset=-1` (or a saved offset) to fetch all historical data, receives a `Stream-Up-To-Date: true` header when caught up, then transitions to `GET ?offset=X&live=long-poll` or `&live=sse` for real-time tailing. The server periodically closes SSE connections (~60 seconds) for CDN compatibility; clients reconnect with their last offset. No server-side session state exists — progress tracking is entirely client-side, which maps well to per-coroutine cursors.

---

## B. Exactly-once semantics work within an epoch but require care across crashes

**The idempotent producer uses a three-header system.** Every append includes `Producer-Id` (client-chosen identifier), `Producer-Epoch` (monotonically increasing integer), and `Producer-Seq` (per-batch sequence number). All three must be provided together or not at all. The server validates them against stored state per `(stream, producerId)` tuple:

- **`seq == lastSeq + 1`** → Accept, return 200 OK
- **`seq <= lastSeq`** → Duplicate detected, return 204 No Content (idempotent success)
- **`seq > lastSeq + 1`** → Gap detected, return 409 Conflict with `Producer-Expected-Seq` header
- **`epoch < state.epoch`** → Zombie fenced, return 403 Forbidden with current epoch
- **`epoch > state.epoch` and `seq != 0`** → Invalid, return 400 Bad Request (new epochs must start at seq 0)

This provides **exactly-once within an epoch**. The sequence number is per-batch (not per-message), and pipelined requests are supported — the server returns `Producer-Seq` in the response confirming the highest accepted sequence, enabling clients to recover pipeline state after reconnection.

**Crash recovery trades exactly-once for at-least-once across epoch boundaries.** When a producer crashes, it increments its epoch and starts sequence at 0. The server treats this as a new session. If the server uses non-atomic storage (i.e., producer state and log data are not committed in a single transaction), there is a crash window where the append persisted but the sequence counter did not update. Bumping the epoch resolves this but may produce a duplicate of the last pre-crash append. For a durable execution log, this means the **replay engine must be idempotent with respect to a duplicated final Yield event at an epoch boundary**. The spec recommends that persistent stores commit producer state and log appends atomically (e.g., single database transaction) to eliminate this window entirely.

**No multi-event atomic append exists in the protocol.** Each HTTP POST is one atomic unit. You cannot atomically append a Yield event and a Close event together. For the durable execution use case, this means causal ordering constraints (Close must follow all child yields) must be enforced by **sequencing discipline at the application layer** — append child completion first, await acknowledgment, then append the parent yield that depends on it. The `IdempotentProducer` does support batching via `lingerMs` (accumulating messages over a time window into a single POST), but a batch is a single sequence number — it's atomic at the batch level, not transactional across semantically distinct events.

---

## C. Mapping durable execution invariants requires application-layer contracts

**"Persist-before-resume" depends on your interpretation of the 200 acknowledgment.** The protocol's durability contract states that acknowledged bytes persist until deletion or expiry, but **does not prescribe fsync, replication factor, or WAL semantics**. The spec explicitly lists in-memory storage as valid. For durable execution, "persist-before-resume" means: append the Yield event, await the 200 response from a server whose storage backend provides crash-durable persistence (file-backed with fsync, database-backed, or the hosted Electric Cloud service), and only then call `generator.next(result)`. The `IdempotentProducer`'s fire-and-forget `append()` with `lingerMs` batching is **not safe for persist-before-resume** — use `producer.flush()` after each critical event to await acknowledgment, or use raw HTTP POSTs with explicit await.

**Causal ordering requires a stream-per-coroutine or careful global sequencing strategy.** The protocol guarantees total order within a single stream. Two viable architectures exist:

- **One stream per coroutine**: Each coroutine writes to its own stream. Per-coroutine cursors map directly to per-stream offsets. Causal ordering across coroutines (Close before parent yield) is enforced by the client: append child Close, await ack, then append parent Yield. This provides natural isolation but creates many streams.
- **Single stream with framed events**: All coroutines append to one stream using JSON mode (which preserves message boundaries). Each event includes a `coroutineId` field. The single-stream total order automatically captures causal relationships *if* the client sequences appends correctly. Per-coroutine replay uses a filtered cursor over the shared stream.

For structured concurrency, the **single-stream model** is likely superior because it naturally captures cross-coroutine causal order in the global offset sequence. The ordering constraint for Close events — that a child's Close must appear in the stream before the parent's Yield that consumes the child's result — is enforced by the runtime: complete the child, append its Close event, await ack, then resume the parent and append its Yield.

**Client-side buffering strategy must prioritize correctness over throughput.** The recommended approach for durable execution is **synchronous-append mode**: each effect resolution triggers an immediate append with an awaited acknowledgment before the generator resumes. The `lingerMs` batching optimization is only safe for events where ordering is already guaranteed by the client's sequential execution — for example, multiple Yield events within a single coroutine can be batched if the generator will not be resumed until the batch is acknowledged. The `autoClaim: true` option on `IdempotentProducer` provides automatic epoch recovery on restart, suitable for a durable execution scheduler that restarts after a crash.

---

## D. Operational profile suits local dev; production requires hosted or custom server

**Deployment options span development to production.** The reference Node.js server (`@durable-streams/server`) supports in-memory and file-backed storage for development. A Caddy-based binary ships for macOS, Linux, and Windows, suitable for local dev and light production. The hosted Electric Cloud service (launched January 2026) provides **240K writes/second** for small messages, 15–25 MB/sec sustained throughput, and tested support for 1M concurrent connections per stream. For durable execution, the hosted service or a custom server with a database-backed store (PostgreSQL, SQLite) and atomic producer state commits is the minimum viable production deployment.

**Observability is minimal at this stage.** The project is early (self-described: "Docs are sparse, guides are coming"). Available hooks include the `onError` callback on `IdempotentProducer`, `Stream-Next-Offset` and `Producer-Seq` response headers for tracking progress, a test UI package (`@durable-streams/test-ui`) for visual stream inspection, and the CLI tool. No Prometheus metrics, OpenTelemetry integration, structured logging, or production dashboards exist yet. For a durable execution system, you'll need to build observability around the HTTP response headers — tracking append latency (time from POST to 200), consumer lag (difference between tail offset and reader offset), and epoch transitions (indicating producer restarts or fencing events).

**Security delegates to HTTP infrastructure.** The base protocol mandates HTTPS in production but has no built-in authentication. The hosted version uses Bearer token auth. Self-hosted deployments should run behind an API gateway or reverse proxy handling auth. **Stream naming is URL-path-based** — tenant isolation requires either path-prefix scoping (e.g., `/tenant-A/coroutine-123`) or separate server instances. The protocol notes that "sequence numbers are scoped per authenticated writer identity (or per stream, depending on implementation)" — this means auth identity can enforce single-writer semantics if the server implementation supports it.

---

## Durable Streams ↔ durable execution mapping table

| Execution requirement | Durable Streams feature | Gaps | Mitigation |
|---|---|---|---|
| **Append-only log** | Core model — streams are append-only, immutable by position | None | Direct fit |
| **Monotonic offsets** | Opaque, lexicographically sortable, server-generated offsets | Offsets are opaque (can't derive sequence numbers) | Store logical sequence in event payload; use offset only for resumption |
| **Prefix-closure / no gaps** | Inherent from append-only + acknowledged durability | None | Direct fit |
| **Single writer** | Producer-Id + Epoch fencing (403 on stale epoch) | Protocol allows multiple Producer-Ids per stream | Use one Producer-Id per stream; rely on epoch fencing for failover |
| **Single source of truth** | "Once written and acknowledged, bytes persist until deleted" | Durability is implementation-dependent (no fsync mandate) | Choose a server with crash-durable storage; verify with IMPLEMENTATION_TESTING suite |
| **Persist-before-resume** | 200 response = server considers data durable | No guarantee of fsync/replication at protocol level; fire-and-forget API not safe | Await 200 on every critical append; disable lingerMs batching for Yield/Close events; verify server's durability semantics |
| **Exactly-once Yield recording** | IdempotentProducer deduplicates via (Id, Epoch, Seq) | At-least-once across epoch boundaries for non-atomic stores | Use atomic store; or make replay idempotent w.r.t. duplicate final event at epoch boundary |
| **Causal Close ordering** | Total order within a stream guaranteed | No multi-event atomic append; no cross-stream ordering | Enforce client-side: append child Close → await ack → append parent Yield. Single-stream model preferred |
| **Per-coroutine cursor** | Client-side offset tracking with Stream-Next-Offset | Protocol has no built-in per-entity cursor within a stream | Application layer: store `{coroutineId → lastOffset}` map; filter events during replay |
| **Catch up then tail (replay)** | GET with offset → catch-up; live=long-poll/sse → tail; Stream-Up-To-Date header signals transition | No server-side filtered subscription (e.g., by coroutineId) | Client-side filtering during replay; or use per-coroutine streams |
| **Crash recovery without duplicates** | Epoch bump + autoClaim; seq restart at 0 | One potential duplicate at epoch boundary | Replay engine must tolerate/dedup one duplicate Yield at recovery point |
| **Batch append (multiple Yields)** | lingerMs-based batching in IdempotentProducer | Batch is one sequence number — partial batch failure = full retry | Acceptable for non-critical batching; use synchronous append for Close events |
| **Retention / compaction** | Server MAY implement TTL-based retention | No log compaction (Kafka-style); no snapshot support | Build snapshot/compaction at application layer; use Continue-As-New pattern to bound log size |
| **Auth / tenant isolation** | HTTPS + delegated auth; Bearer tokens on hosted | No built-in auth in protocol | API gateway or reverse proxy; path-based tenant scoping |
| **Observability** | Response headers, onError callback, test UI, conformance tests | No metrics, tracing, or structured logging | Build custom observability layer around HTTP headers and error callbacks |

---

## Recommended integration strategy

### Producer/session model

Use **one `IdempotentProducer` per execution run** (i.e., per top-level workflow invocation). Set `Producer-Id` to the workflow execution ID and persist the current epoch in the execution's metadata store. On scheduler restart, load the last known epoch, increment it, and create a new `IdempotentProducer` with `autoClaim: true`. This ensures zombie fencing if a previous scheduler instance is still alive.

```typescript
const producer = new IdempotentProducer(stream, executionId, {
  autoClaim: true,
  lingerMs: 0,  // Disable batching for durable execution — every append is synchronous
  onError: (err) => {
    if (err instanceof StaleEpochError) {
      // Another scheduler took over this execution — halt gracefully
      haltExecution(executionId)
    }
  },
})
```

### Append API usage pattern

For **persist-before-resume correctness**, do not use the fire-and-forget `append()` path. Instead, use explicit flush after each critical event:

```typescript
// After resolving an effect for a coroutine:
function* runWithDurability(operation, producer) {
  const result = yield* executeEffect(operation)
  
  // 1. Append Yield event
  producer.append(JSON.stringify({
    type: "Yield",
    coroutineId,
    seq: localSeq++,
    effect: describeEffect(operation),
    result: serializeResult(result),
  }))
  
  // 2. Await durable persistence BEFORE resuming the generator
  await producer.flush()
  
  // 3. Now safe to resume
  return result
}
```

For **Close events**, the ordering discipline is:

```typescript
// Child coroutine terminates
producer.append(JSON.stringify({
  type: "Close",
  coroutineId: childId,
  state: "ok",  // or "err" or "cancelled"
  value: serializeResult(childResult),
}))
await producer.flush()  // Child Close is durable

// NOW parent can resume and record its Yield that depends on child
producer.append(JSON.stringify({
  type: "Yield",
  coroutineId: parentId,
  seq: parentSeq++,
  effect: { type: "awaitChild", childId },
  result: serializeResult(childResult),
}))
await producer.flush()  // Parent Yield is durable
```

### Read/catch-up/tail pattern for replay

Replay reads the full stream from offset `-1` and filters by coroutine ID:

```typescript
async function replayCoroutine(stream, coroutineId) {
  const events = []
  let offset = "-1"
  
  // Catch-up read — fetch all historical events
  while (true) {
    const response = await stream.read({ offset, live: false })
    for (const event of response.messages) {
      if (event.coroutineId === coroutineId) {
        events.push(event)
      }
    }
    offset = response.nextOffset
    if (response.upToDate) break
  }
  
  // Replay: feed stored results back into the generator
  const gen = createGenerator(coroutineId)
  for (const event of events) {
    if (event.type === "Yield") {
      const yielded = gen.next(deserializeResult(event.result))
      // Verify determinism: yielded.value should match event.effect
      assertDeterministic(yielded.value, event.effect)
    } else if (event.type === "Close") {
      // Coroutine terminated — restore terminal state
      return restoreTerminalState(event)
    }
  }
  
  // Past end of log — switch to live execution
  return { generator: gen, producer, tailOffset: offset }
}
```

For **live tailing** (watching for new events during concurrent execution), transition to long-poll after catch-up:

```typescript
// After catch-up completes, tail for new events
const tailStream = stream.read({ offset: tailOffset, live: "long-poll" })
for await (const chunk of tailStream) {
  processNewEvents(chunk.messages)
}
```

### Error handling and retry policy

- **Transient errors (500, 503, 429)**: Client library retries automatically with Retry-After respect. No application-level handling needed.
- **StaleEpochError (403)**: Another scheduler claimed this execution. Halt the local execution immediately — do not attempt further appends.
- **Sequence gap (409)**: Indicates a client-side bug (skipped a sequence number). Log the error with `Producer-Expected-Seq` and `Producer-Received-Seq` for diagnosis. This should never happen in correct code.
- **Disconnect during append**: Retry with the same `(Id, Epoch, Seq)` tuple. Server returns 204 if the original append succeeded (safe dedup) or 200 if it didn't (first write).
- **Disconnect during read**: Resume from last persisted offset. No data loss possible.

---

## Must-have test checklist for Durable Streams integration

### Crash during append

- [ ] **Server crash mid-append**: Append a Yield event, kill the server process before 200 response reaches client. Restart server. Verify: (a) event either fully persisted or fully absent (no partial writes visible to readers), (b) retrying the same `(Id, Epoch, Seq)` returns 200 or 204 correctly.
- [ ] **Client crash after append, before generator resume**: Append succeeds (200 received), client crashes before calling `generator.next()`. On restart, replay from log. Verify: the event appears exactly once in the stream and the generator replays correctly past it.
- [ ] **Client crash during flush**: `producer.flush()` initiated but process dies. On restart with epoch bump, verify: at most one duplicate of the last event exists. Replay engine correctly handles this duplicate.

### Retry with duplicate prevention

- [ ] **Retry same sequence number**: Send append with `(Id, epoch=1, seq=5)`, receive 200. Send identical request again. Verify: 204 No Content returned (idempotent success), stream contains the event exactly once.
- [ ] **Retry after network timeout**: Send append, simulate network timeout (no response received). Retry with same `(Id, Epoch, Seq)`. Verify: correct response regardless of whether original append reached the server.
- [ ] **Epoch bump dedup boundary**: Append with `(Id, epoch=1, seq=5)`, simulate ambiguous failure. Restart with `epoch=2, seq=0`. Verify: if the epoch-1 append succeeded, the stream has at most one duplicate; if it failed, the event is absent.
- [ ] **Zombie fencing**: Two producers with same Id, one at epoch 1, one at epoch 2. Verify: epoch-1 producer receives 403 Forbidden on next append; epoch-2 producer operates normally.

### Reconnect while tailing

- [ ] **SSE disconnect and resume**: Start SSE tail at offset X. Server closes connection (per 60-second recommendation). Client reconnects at last offset. Verify: no events missed, no duplicates in the received event stream.
- [ ] **Long-poll timeout and resume**: Long-poll returns 200 with empty body (at tail). New event appended. Next long-poll returns the new event. Verify: no gap between catch-up and live.
- [ ] **Network partition during tail**: Simulate extended network outage (>60 seconds). Reconnect. Verify: all events appended during outage are received on catch-up, with correct offset continuity.
- [ ] **Multi-reader consistency**: Two readers tailing the same stream from different offsets. Verify: both see identical event order; neither sees events the other doesn't (eventually).

### Partial replay from offsets

- [ ] **Mid-stream replay**: Persist offset after processing event N. Restart and read from that offset. Verify: event N+1 is the first event received (byte-exact resumption, no skip, no repeat of event N).
- [ ] **Per-coroutine filtered replay**: Stream contains interleaved events from 3 coroutines. Replay coroutine B from its logical position 2. Verify: only coroutine B's events 2..N are fed to the generator, in order.
- [ ] **Replay determinism check**: Replay a coroutine through its full log. At each Yield, verify the generator yields the same effect description as recorded. Any mismatch → non-determinism error.
- [ ] **Replay then live transition**: Replay all historical events, verify `Stream-Up-To-Date: true` signals transition, then switch to live tail. Append a new event. Verify: it appears in the live tail without re-reading historical events.

### Close ordering enforcement

- [ ] **Child Close before parent Yield**: Spawn a child coroutine. Child completes. Verify: Close event for child appears at a lower offset than the parent's Yield event that consumes the child's result.
- [ ] **Sibling cancellation ordering**: Parent spawns children A and B. A errors. Verify: stream contains A's Close(err), then B's Close(cancelled), then parent's Close(err) — in that causal order.
- [ ] **Nested cleanup event ordering**: Child has a `finally` block that performs an effect. Parent halts child. Verify: child's Close event precedes any finally-block Yield events, and all of these precede the parent's next event.
- [ ] **Concurrent children convergence**: Parent spawns N children. All complete. Verify: all N Close events appear before the parent's Yield that joins them, regardless of completion order among siblings.

### Protocol edge cases

- [ ] **Empty stream read**: Read from offset `-1` on an empty stream. Verify: 200 with empty body (or empty JSON array), `Stream-Up-To-Date: true`, valid `Stream-Next-Offset`.
- [ ] **Maximum event size**: Append an event at the server's payload limit. Verify: accepted. Append one byte over the limit. Verify: 413 Payload Too Large.
- [ ] **Stream creation idempotency**: PUT to create a stream twice with the same content type. Verify: second PUT either succeeds idempotently or returns appropriate error; stream data is not corrupted.
- [ ] **Offset opacity**: Never construct, parse, or compare offsets except via lexicographic string comparison. Test that stored offsets from a previous server version still work after server upgrade.