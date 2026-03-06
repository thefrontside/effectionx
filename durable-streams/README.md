# @effectionx/durable-streams

Durable execution for [Effection](https://frontside.com/effection) — crash-safe generator workflows that survive process restarts by journaling effects to an append-only stream.

```typescript
import { durableRun, durableCall, durableAll } from "@effectionx/durable-streams";

function* processOrder(orderId: string): Workflow<void> {
  const order = yield* durableCall("fetchOrder", () => fetchOrder(orderId));
  const [fraud, inventory] = yield* durableAll([
    () => durableCall("checkFraud", () => checkFraud(order)),
    () => durableCall("checkInventory", () => checkInventory(order)),
  ]);
  yield* durableCall("chargeCard", () => chargeCard(order.payment));
  yield* durableCall("fulfillOrder", () => fulfill(order));
}
```

If the process crashes between `chargeCard` and `fulfillOrder`, the workflow resumes exactly from that point. `chargeCard` is not called again. `fulfillOrder` runs once, as intended.

---

## Mental model

An Effection generator is already an **effect description machine** — it yields descriptions of what it wants to happen, and the runtime interprets them. `@effectionx/durable-streams` extends this: instead of simply executing each effect, the runtime first journals the result to an append-only stream, then resumes the generator.

On restart, the runtime reads those journal entries back and feeds the stored results directly into the generator, replaying its execution path without re-running any side effects. When the journal runs out, execution transitions seamlessly to live mode.

The generator itself never knows which mode it's in. It sees a sequence of values flowing from `yield*` — whether those values came from a live network call or a replay of one is invisible to it.

This means your workflow logic is written once, with no replay-awareness code, no `if (replaying)` branches, and no explicit checkpoint calls.

---

## The journal: what goes in, what doesn't

The journal is an append-only stream of two event types:

```typescript
type DurableEvent = Yield | Close;
```

**`Yield`** is written after a user-facing effect resolves. It records both the effect description (what was requested) and the result (what happened):

```typescript
interface Yield {
  type: "yield";
  coroutineId: string;        // e.g. "root.0.1"
  description: {
    type: string;             // "call", "sleep", "action", etc.
    name: string;             // the stable effect name
    [key: string]: Json;      // extra input fields, stored verbatim
  };
  result: Result;             // { status: "ok", value } | { status: "err" } | { status: "cancelled" }
}
```

**`Close`** is written when a coroutine terminates — whether it completed, threw an error, or was cancelled. Close events are load-bearing: they tell the runtime on restart which coroutines finished cleanly and which need re-execution.

### What goes into the journal

User-facing effects: anything that interacts with the outside world. In practice, anything you express with `durableCall`, `durableSleep`, `durableAction`, `durableEach`, or a custom `createDurableEffect`.

```
[0] yield  root    { type: "call",  name: "fetchOrder" }    result: { status: "ok", value: { id: "42", ... } }
[1] yield  root.0  { type: "call",  name: "checkFraud" }    result: { status: "ok", value: true }
[2] yield  root.1  { type: "call",  name: "checkInventory" } result: { status: "ok", value: true }
[3] close  root.0  result: { status: "ok", value: true }
[4] close  root.1  result: { status: "ok", value: true }
[5] yield  root    { type: "call",  name: "chargeCard" }     result: { status: "ok" }
[6] yield  root    { type: "call",  name: "fulfillOrder" }   result: { status: "ok" }
[7] close  root    result: { status: "ok" }
```

### What doesn't go into the journal

**Infrastructure effects** — scope setup, context reads, middleware. These run transparently during both live execution and replay. They're deterministic by construction: they depend only on the runtime's internal state, which is reconstructed identically during replay because all user-facing effects are replayed in order.

The `ephemeral()` function is the explicit escape hatch when you need to run non-durable Effection operations inside a `Workflow`. It produces no journal entry and re-runs on replay:

```typescript
function* myWorkflow(): Workflow<string> {
  // useScope() is infrastructure — use ephemeral() to run it in a Workflow
  const signal = yield* ephemeral(useAbortSignal());

  // durableCall is journaled
  return yield* durableCall("fetchData", () => fetchData(signal));
}
```

---

## Workflows vs. Operations

A `Workflow<T>` is a generator that only yields `DurableEffect` values. TypeScript enforces this at compile time — yielding a plain Effection `Operation` inside a `Workflow` generator is a type error:

```typescript
function* safeWorkflow(): Workflow<void> {
  yield* durableSleep(1000);         // ✓ DurableEffect
  yield* durableCall("fetch", fn);   // ✓ DurableEffect
  yield* sleep(1000);                // ✗ TypeError — use durableSleep
  yield* call(fn);                   // ✗ TypeError — use durableCall
}
```

This is the key design guarantee: **if it compiles as a `Workflow`, it's durable**. No runtime checks needed, no footguns hiding behind valid-looking code.

Every `Workflow<T>` is structurally compatible with `Operation<T>`, so you can always use a workflow where an operation is expected.

### Core workflow effects

| Effect | Description |
|--------|-------------|
| `durableCall(name, fn)` | Call a function returning a `Promise` or `Operation` |
| `durableSleep(ms)` | Wait for a duration |
| `durableAction(name, executor)` | Custom callback-based effect |
| `versionCheck(name, { minVersion, maxVersion })` | Version gate for code evolution |
| `durableEach(name, source)` | Durable iteration with per-item checkpointing |

### Concurrency combinators

Combinators return `Workflow<T>` and delegate to Effection's native structured concurrency primitives. Children must themselves be `Workflow<T>`.

| Combinator | Behavior |
|------------|----------|
| `durableSpawn(workflow)` | Spawn a concurrent child, returns `Task<T>` |
| `durableAll([...workflows])` | Run all concurrently, wait for all to complete |
| `durableRace([...workflows])` | Run all, return first winner, cancel the rest |

### Prefer Operations over async/await

When writing functions called from `durableCall`, prefer returning an `Operation` over a `Promise`. Operations participate fully in Effection's structured concurrency — they can be cancelled, they respect scope lifetimes, and they compose cleanly:

```typescript
// Prefer this:
function fetchUser(id: string): Operation<User> {
  return resource(function* (provide) {
    const controller = new AbortController();
    try {
      const response = yield* call(() =>
        fetch(`/users/${id}`, { signal: controller.signal })
      );
      yield* provide(yield* call(() => response.json()));
    } finally {
      controller.abort();
    }
  });
}

// Over this:
async function fetchUser(id: string): Promise<User> {
  const response = await fetch(`/users/${id}`);
  return response.json();
}

// Both work with durableCall, but the Operation version is cancellable:
const user = yield* durableCall("fetchUser", () => fetchUser(id));
```

When the parent scope is cancelled (e.g., a race loser), an `Operation`-returning function cleans up immediately. A `Promise`-returning function keeps the network request open until it settles.

### Durable iteration

Use `durableEach` to iterate over a source with per-item checkpointing. Each call to `durableEach.next()` produces a journal entry — if the process crashes mid-loop, it resumes at the next unprocessed item:

```typescript
function* processQueue(): Workflow<void> {
  for (let msg of yield* durableEach("queue", queueSource)) {
    yield* durableCall("process", () => processMessage(msg));
    yield* durableEach.next(); // checkpoint + pre-fetch next item
  }
}
```

The `DurableSource` interface uses Operations:

```typescript
interface DurableSource<T extends Json> {
  next(): Operation<{ value: T } | { done: true }>;
  close?(): void; // called on cancellation or completion, must be idempotent
}
```

---

## Entry point: durableRun

`durableRun` is itself an `Operation<T>` — it inherits the caller's Effection scope, including any middleware installed on it:

```typescript
function* durableRun<T extends Json | void>(
  workflow: () => Workflow<T> | Operation<T>,
  options: { stream: DurableStream; coroutineId?: string }
): Operation<T>
```

Typical usage from standalone async code:

```typescript
import { run } from "@effection/effection";
import { durableRun } from "@effectionx/durable-streams";
import { useHttpDurableStream } from "@effectionx/durable-streams";

await run(function* () {
  const stream = yield* useHttpDurableStream({
    baseUrl: "http://localhost:4437",
    streamId: "order-42",
    producerId: "worker-1",
    epoch: 1,
  });

  const result = yield* durableRun(
    () => processOrder("order-42"),
    { stream }
  );
});
```

When `durableRun` is called as a generator inside another generator, it shares the parent's scope chain — middleware installed before the `yield*` is visible inside the workflow:

```typescript
function* supervisedRun(): Operation<void> {
  // Install middleware (see Replay Guards below)
  yield* useFileContentGuard();

  // All workflows run inside this durableRun inherit the guard
  yield* durableRun(() => buildPipeline(), { stream });
}
```

---

## Coroutine identity

Every generator instance running under `durableRun` gets a stable coroutine ID — a dot-delimited path that encodes its position in the scope tree:

```
root                    → "root"
  first child of root   → "root.0"
  second child of root  → "root.1"
    first child of .1   → "root.1.0"
```

These IDs are assigned by a per-parent creation counter and are identical across runs, given the same generator code and the same resolution sequence. This determinism is what makes it possible to match journal entries to the right generator instances on replay.

You never assign or manage coroutine IDs manually — they're derived entirely from the structure of your generator code.

---

## Replay

When `durableRun` starts, it reads the full event stream, builds an in-memory `ReplayIndex`, then starts the workflow generator. As the generator yields effects:

1. **Replay path** — if the index has an entry for this coroutine at this position, the stored result is fed directly to the generator via `iterator.next(value)` or `iterator.throw(error)`. The effect's live executor is never called.

2. **Live path** — if the index has no entry, the effect executes normally. Once it resolves, the result is persisted to the stream *before* the generator is resumed (`persist-before-resume`).

The transition from replay to live happens **per-coroutine**, not globally. In a fork/join workflow where two children ran before a crash and a third didn't, the first two replay their stored results while the third executes live — all simultaneously, within the same `durableAll`.

### Persist-before-resume

This is the protocol's most critical invariant: **the `Yield` event must be durably written to the stream before `iterator.next()` is called**. If the process crashes between an effect resolving and the journal write completing, the effect will be re-executed on the next run — which is safe, because the generator hasn't advanced past that point yet.

Violating this invariant (advancing the generator before the write) creates an unrecoverable gap: the journal would be missing an entry, and replay would feed the wrong result to a subsequent effect.

---

## Divergence detection

During replay, every yielded effect is validated against its journal entry. Only two fields are compared: `description.type` and `description.name`. If they match, replay proceeds. If they don't, a `DivergenceError` is raised immediately.

```typescript
// Journal has: { type: "call", name: "fetchOrder" }
// Code yields:  { type: "call", name: "chargeCard" }  ← mismatch at position 0
// → DivergenceError
```

Two additional terminal conditions are checked:

- **Generator finishes early**: the code returns before consuming all journal entries — effects were removed.
- **Generator continues past close**: the journal shows the coroutine closed, but the code keeps yielding — effects were added.

Both indicate the code has changed in a way that makes the stored history invalid. The solution for intentional code changes is `versionCheck`:

```typescript
function* orderWorkflow(orderId: string): Workflow<void> {
  const version = yield* versionCheck("add-fraud-check", { minVersion: 0, maxVersion: 1 });

  if (version >= 1) {
    // New in v1 — in-flight v0 workflows skip this, new v1 workflows run it
    yield* durableCall("fraudCheck", () => fraudCheck(orderId));
  }

  yield* durableCall("fetchOrder", () => fetchOrder(orderId));
  yield* durableCall("chargeCard", () => chargeCard(orderId));
}
```

### Divergence policy

The default divergence policy is strict — any mismatch is fatal. You can override this per-scope using `scope.around(Divergence, ...)`:

```typescript
scope.around(Divergence, {
  decide([info], next) {
    // "run-live" disables replay from this point forward for this coroutine
    if (info.kind === "description-mismatch" && canRecoverFrom(info)) {
      return { type: "run-live" };
    }
    return next(info);
  }
});
```

The `run-live` decision tells the runtime to disable replay for that coroutine and execute all subsequent effects live, effectively treating the crash point as the beginning of a fresh run.

---

## Replay guards

Divergence detection catches *structural* mismatches — the effect sequence changed. Replay guards catch *staleness* mismatches — the effect sequence is the same, but the external world has changed since the journal entry was recorded.

The canonical example is a file-backed effect. If the workflow previously read `./component.mdx` and that file has since been edited, replaying the stored result would silently use stale content. A replay guard detects this and can halt replay with an error.

### The two-phase model

Every replay guard has two phases, separated by a strict I/O boundary:

**Phase 1 — `check`**: runs in generator context before replay begins. I/O is allowed. Use it to gather current state (compute file hashes, check timestamps) and cache results in the middleware closure.

**Phase 2 — `decide`**: runs synchronously inside the replay loop, after identity matching succeeds. Must be pure — no I/O, no side effects. Reads from the cache populated during `check` and returns a `ReplayOutcome`.

This separation is necessary because the replay loop is synchronous. All observation-gathering must happen upfront.

### Writing a replay guard

Use `scope.around(ReplayGuard, ...)` to install a guard. The guard receives each `Yield` event from the journal:

```typescript
import { ReplayGuard, type ReplayOutcome } from "@effectionx/durable-streams";
import { call, useScope } from "@effection/effection";
import type { Operation } from "@effection/effection";

function* useMyGuard(): Operation<void> {
  const scope = yield* useScope();

  // The cache lives in this closure — populated during check, read during decide
  const cache = new Map<string, string>();

  scope.around(ReplayGuard, {
    // Phase 1: gather observations (I/O allowed, runs before replay starts)
    *check([event], next): Operation<void> {
      const resourceId = event.description.resourceId;
      if (typeof resourceId === "string" && !cache.has(resourceId)) {
        const currentVersion = yield* call(() => fetchCurrentVersion(resourceId));
        cache.set(resourceId, currentVersion);
      }
      return yield* next(event); // always call next — other guards may need this event
    },

    // Phase 2: make a decision (synchronous, pure, no I/O)
    decide([event], next): ReplayOutcome {
      const resourceId = event.description.resourceId;
      if (typeof resourceId !== "string") {
        return next(event); // not our event — delegate
      }

      const storedVersion = (event.result as any)?.value?.version;
      const currentVersion = cache.get(resourceId);

      if (currentVersion && currentVersion !== storedVersion) {
        return {
          outcome: "error",
          error: new Error(
            `Resource changed: ${resourceId} (stored: ${storedVersion}, current: ${currentVersion})`
          ),
        };
      }

      return next(event); // no opinion — delegate
    },
  });
}
```

Install the guard before calling `durableRun`:

```typescript
function* supervisedWorkflow(): Operation<void> {
  yield* useMyGuard(); // children inherit this through Effection's scope inheritance

  yield* durableRun(() => myWorkflow(), { stream });
}
```

### Effect descriptions carry input data; results carry output data

For a guard to work, the effect being guarded must store the information needed for validation:

- **Input fields** (the path, resource ID, URL) go in extra fields on `EffectDescription`. These fields are stored verbatim in the journal but never compared during divergence detection.
- **Output fields** (content hash, ETag, version) go in `result.value` alongside the actual content.

```typescript
function* durableReadFile(path: string): Workflow<string> {
  const { content } = yield* durableCall("readFile", async () => {
    const content = await Deno.readTextFile(path);
    const hashBuffer = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(content));
    const contentHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, "0")).join("");

    return { content, contentHash };
    //  ↑ content hash returned alongside the actual content
  });
  return content;
}

// The description stored in the journal:
// { type: "call", name: "readFile", path: "./input.txt" }
//                                   ↑ path stored as extra field

// The result stored in the journal:
// { status: "ok", value: { content: "...", contentHash: "sha256:abc123" } }
//                                           ↑ hash stored in result value
```

The guard's `check` phase reads `event.description.path` and computes the current hash. The `decide` phase reads `event.result.value.contentHash` and compares. No separate metadata or side-channel is needed.

### The built-in file content guard

`useFileContentGuard` implements exactly this pattern for file-backed effects. Install it and your file-reading workflows will automatically detect stale content:

```typescript
import { useFileContentGuard } from "@effectionx/durable-streams";

function* myPipeline(): Operation<void> {
  yield* useFileContentGuard();
  yield* durableRun(() => buildDocuments(), { stream });
}
```

Any effect with a `path` field in its description and a `contentHash` field in its result value will be checked against the current file content. Events without these fields pass through unchanged.

### Guard composition

Multiple guards compose naturally. Each guard either returns an outcome or calls `next(event)` to pass control to the next guard in the chain:

```typescript
function* supervisedPipeline(): Operation<void> {
  yield* useFileContentGuard();      // checks file-backed effects
  yield* useSchemaVersionGuard();    // checks effects tagged with schema version
  yield* useEnvVarGuard(["DB_URL"]); // checks effects that depend on env vars

  yield* durableRun(() => pipeline(), { stream });
}
```

If any guard returns `{ outcome: "error" }`, replay halts. Guards that return `next(event)` delegate, and the default at the bottom of the chain always returns `{ outcome: "replay" }` — preserving "logs are authoritative" for events that no guard has an opinion on.

---

## Stream backends

`DurableStream` is an abstract interface:

```typescript
interface DurableStream {
  readAll(): Operation<DurableEvent[]>;
  append(event: DurableEvent): Operation<void>;
}
```

### In-memory (testing)

```typescript
import { InMemoryStream } from "@effectionx/durable-streams";

const stream = new InMemoryStream();
// Pre-populate with events:
const stream = new InMemoryStream(existingEvents);
// Inspect append count, inject failures:
stream.appendCount;
stream.injectFailure = new Error("disk full");
```

### HTTP (Durable Streams protocol)

Backed by the [Durable Streams](https://durable.run) protocol — an append-only HTTP streaming protocol with idempotent producers and epoch-based fencing.

```typescript
import { useHttpDurableStream } from "@effectionx/durable-streams";

const stream = yield* useHttpDurableStream({
  baseUrl: "http://localhost:4437",
  streamId: "workflow-abc-123",
  producerId: "scheduler-worker-1",
  epoch: 1, // increment this on scheduler restart to fence zombie writers
});
```

Appends are serialized via an internal queue and worker — concurrent `append()` calls from `durableAll` children are safely sequenced without application-level coordination. Every append is synchronous (no `lingerMs` batching) to preserve `persist-before-resume`.

### Custom backends

Implement `DurableStream` directly. The only requirements are append-only semantics, prefix-closure (no gaps), and that `append()` only resolves after the event is durably persisted:

```typescript
class PostgresStream implements DurableStream {
  *readAll(): Operation<DurableEvent[]> {
    return yield* call(() =>
      db.query("SELECT event FROM events WHERE stream_id = $1 ORDER BY position", [this.streamId])
        .then(r => r.rows.map(r => r.event))
    );
  }

  *append(event: DurableEvent): Operation<void> {
    yield* call(() =>
      db.query("INSERT INTO events (stream_id, event) VALUES ($1, $2)", [this.streamId, event])
    );
  }
}
```

---

## Long-running workflows

For workflows that process unbounded streams, journals grow without limit. The `durableEach` + Continue-As-New pattern bounds this growth: after N iterations, the workflow signals for a fresh start with the current cursor position as its seed. This is a planned feature — in the meantime, `durableEach` is appropriate for bounded batches where journal size is not a constraint.

---
