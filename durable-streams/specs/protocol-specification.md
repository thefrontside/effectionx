# Two-Event Durable Execution Protocol for Generator-Based Structured Concurrency

**Status:** Draft Specification
**Scope:** Effection-style generator runtime with append-only durable stream

---

## 1. Overview

This specification defines a durable execution protocol for generator-based
structured concurrency runtimes. The protocol records every observable effect
and its resolution to an append-only stream using exactly two event types.
On restart, the runtime replays stored resolutions into generators
deterministically, then transitions seamlessly to live execution for
any effects not yet in the stream.

The protocol is designed for runtimes where:

- Workflows are expressed as generator functions (`function*` / `yield*`).
- A synchronous reducer loop drives generators by calling `iterator.next(value)`,
  `iterator.throw(error)`, and `iterator.return()`.
- Concurrency is tree-structured: every task has exactly one parent scope,
  and child lifetimes are contained within parent lifetimes.

### 1.1 Design principles

**Generators are effect description machines.** A generator never performs side
effects directly. It yields descriptions of desired effects. The reducer
interprets descriptions during live execution and bypasses them during replay.
The generator cannot distinguish the two modes.

**The stream is the single source of truth.** All durable state is encoded in
the append-only event stream. No external index, database, or in-memory
structure is authoritative — they are all derived from the stream.

**Every stream entry is self-contained.** Each event carries all information
needed to interpret it. There are no cross-references between events, no
link-by-ID patterns, and no events that require a future event to become
meaningful.

**Structure enables durability.** Tree-structured concurrency constrains the
execution model so that task lifetimes nest strictly. This makes the execution
trace a well-ordered tree that can be checkpointed, replayed, and cancelled
deterministically. Without structure, replay of concurrent tasks is
ambiguous.

### 1.2 Non-goals

This protocol does not address:

- Unstructured `async`/`await` or callback-first orchestration.
- Reactive streams that do not model execution control flow.
- Best-effort or heuristic replay.
- Transport, encoding, or storage layer specifics (the stream is abstract).
- Distributed coordination between multiple workers (single-writer assumed).

### 1.3 Terminology

**Reducer.** The synchronous loop that drives generators. It dequeues
instructions from a priority queue, calls `iterator.next(value)` to
advance the generator, and processes the yielded effect. The reducer is
not a scheduler — it makes no decisions about which coroutine to run
next. The next instruction is always the next item in the queue, ordered
by scope depth (shallower scopes first — parent effects are entered
before child effects), FIFO within a tier. This determinism is what
makes replay possible.

**Runtime.** The broader system that manages the lifecycle of scopes,
coroutines, and the durable stream. The runtime encompasses the reducer
but also handles concerns outside the reduce loop: scope creation and
destruction, cancellation propagation, stream persistence, and the
replay index. When this specification says "the runtime does X," it
means the implementation as a whole is responsible, not necessarily the
reduce loop specifically.

**Coroutine.** A generator instance being driven by the reducer. Each
coroutine has a unique ID (§3), an iterator, and belongs to exactly one
scope.

**Scope.** A structured concurrency boundary that owns zero or more
child coroutines. Scopes enforce lifetime containment (§7.1).

**Stream.** The append-only sequence of durable events. The single
source of truth for replay.

---

## 2. Event types

The protocol defines exactly two event types. Every event in the stream is
one of these.

```typescript
type DurableEvent = Yield | Close;
```

### 2.1 `Yield` — an effect was executed and resolved

```typescript
interface Yield {
  type: "yield";
  coroutineId: CoroutineId;
  description: EffectDescription;
  result: Result;
}
```

A `Yield` event is written **after** an effect resolves. It records both what
was requested (the description) and what the outcome was (the result). During
replay, the description is used for divergence detection and the result is
fed directly to the generator via `iterator.next(value)` or
`iterator.throw(error)`.

A `Yield` event is never written for infrastructure effects (scope creation,
scope middleware, internal bookkeeping). Only user-facing effects — those
that represent observable interactions with the outside world — produce
`Yield` events. The classification of an effect as infrastructure vs.
user-facing is determined by the runtime, not by this protocol.

### 2.2 `Close` — a coroutine reached a terminal state

```typescript
interface Close {
  type: "close";
  coroutineId: CoroutineId;
  result: Result;
}
```

A `Close` event is written when a coroutine terminates. The three terminal
states are:

- **Completed** (`status: "ok"`): the generator returned normally.
- **Failed** (`status: "err"`): an unhandled error propagated out of the generator.
- **Cancelled** (`status: "cancelled"`): the coroutine was halted by its parent
  or by an external signal.

`Close` events cannot be derived from `Yield` events because:

- Cancellation produces no yield — the coroutine is halted externally.
- Return values are not captured by any yield (the generator's final
  `return` statement does not yield).
- Unhandled errors that kill a coroutine may not correspond to any
  specific effect resolution.

`Close` events are **load-bearing for partial replay.** When the runtime
resumes from a partial stream after a crash, `Close` events tell the
runtime which scopes completed before the crash and which require
re-execution. Without `Close` events, the runtime would have to infer
completion from the absence of further yields — which is ambiguous (a
coroutine with no further yields might be completed, or might be
mid-execution at the crash point).

### 2.3 Shared types

```typescript
/** Dot-delimited hierarchical path. See §3. */
type CoroutineId = string;

/**
 * Structured effect identity for divergence detection.
 * See §6 for matching rules.
 *
 * Only `type` and `name` are compared during divergence detection.
 * Extra fields beyond `type` and `name` are stored verbatim in the
 * journal but never compared. They exist for runtime use (e.g.,
 * replay guards reading input parameters like file paths).
 */
interface EffectDescription {
  /** Effect category. E.g., "call", "sleep", "action", "spawn", "resource". */
  type: string;
  /** Stable name within the category. E.g., function name, resource label. */
  name: string;
  /** Extra fields stored verbatim, never compared during divergence detection. */
  [key: string]: Json;
}

type Result =
  | { status: "ok"; value?: Json }
  | { status: "err"; error: SerializedError }
  | { status: "cancelled" };

/** Any JSON-serializable value. */
type Json = string | number | boolean | null | Json[] | { [key: string]: Json };

interface SerializedError {
  message: string;
  name?: string;
  stack?: string;
}
```

### 2.4 Why `EffectDescription` is structured, not a flat string

A flat description string (e.g., `"action"`) conflates effect type and
identity. When multiple effects share the same description, divergence
detection cannot distinguish reordering from correct execution.

For example, in a workflow that yields six `"action"` effects (three
keypresses followed by three queue reads), reordering a keypress and a
queue read produces a journal where every position still shows `"action"` —
divergence is not caught.

The structured `{ type, name }` representation provides two levels of
discrimination:

- **Type mismatch** (e.g., `"call"` vs. `"sleep"`) is always a hard
  divergence error.
- **Name mismatch** (e.g., `call("fetchOrder")` vs. `call("chargeCard")`)
  is a hard divergence error by default, with the option of a configurable
  warning-only mode for specific name changes during migration.

Effect arguments are intentionally excluded from the description. Argument
changes between versions are generally safe (the generator handles whatever
value it receives) and checking them produces false-positive divergence
errors during legitimate refactors.

---

## 3. Coroutine identity

### 3.1 Deterministic per-parent counter scheme

Coroutine IDs are not recorded in the stream. They are assigned
deterministically at runtime using a per-parent creation counter:

```
root                    → "root"
  first child of root   → "root.0"
  second child of root  → "root.1"
    first child of .1   → "root.1.0"
  third child of root   → "root.2"
```

The ID of a coroutine is the dot-concatenation of its ancestor chain,
where each segment is the zero-based creation index within the parent scope.

### 3.2 Why this works

The determinism of this scheme depends on three properties of the runtime:

**Property 1: The reduce loop is synchronous.** The reducer processes
instructions in a synchronous `while` loop with a re-entrant guard. When
an effect resolves synchronously (as all replayed effects do), its
resolution is enqueued and processed in the same loop iteration. There
are no async gaps where scheduling non-determinism could alter ordering.

**Property 2: Generators are deterministic.** A generator function given
the same arguments and the same sequence of values fed via `next()` produces
the same sequence of yields. Iteration constructs like `for...of` in `all()`
always process their operands in array order. Each `spawn` within such a
loop is processed in deterministic order within the synchronous reduce loop.

**Property 3: Replay preserves ordering.** During replay, every user-facing
effect resolves synchronously (the stored result is fed back immediately).
This means the reduce loop processes spawns in the same order as the original
run. The per-parent counter increments in an identical sequence.

**Property 4: Priority ordering is structural.** If the runtime uses a
priority queue ordered by scope depth (lower depth = higher priority),
priorities are determined by code structure (nesting depth), not by timing.
Shallower scopes are dequeued first — when a parent and child effect are
enqueued in the same tick, the parent is always entered first. Instructions
at the same priority are processed in FIFO order within their tier.

### 3.3 Formal requirement

> **INVARIANT (Deterministic Identity):** For any generator function `G`
> and any sequence of effect resolutions `R₁, R₂, ..., Rₙ`, the sequence
> of coroutine IDs assigned during execution of `G` with resolutions `R` is
> identical across all executions. Two runs of the same generator with the
> same resolution sequence must produce the same set of coroutine IDs in
> the same order.

### 3.4 Spawn during teardown and `ensure()`

When a scope is destroyed, the runtime runs teardown logic (`ensure()`
blocks, resource destructors) in reverse creation order. If teardown code
spawns new children, the per-parent counter continues incrementing
from where it left off.

This is safe because teardown order is determined by the scope tree
structure (reverse creation order), which is itself deterministic
(see §3.2). The counter path is therefore identical across live and
replay runs, even for children spawned during teardown.

> **REQUIREMENT:** Implementations MUST test the following scenario
> explicitly: an `ensure()` block inside a scope spawned by `all()`
> that itself spawns a child. The coroutine ID of the child spawned
> during teardown must be identical between live execution and replay.

---

## 4. The replay loop

### 4.1 Replay index

The replay index is a derived, in-memory structure built from the stream
on startup. It provides per-coroutine cursored access to yield events
and keyed access to close events:

```typescript
class ReplayIndex {
  private yields = new Map<CoroutineId, Array<{ description: EffectDescription; result: Result }>>();
  private cursors = new Map<CoroutineId, number>();
  private closes = new Map<CoroutineId, Close>();

  constructor(events: DurableEvent[]) {
    for (const event of events) {
      if (event.type === "yield") {
        const list = this.yields.get(event.coroutineId) ?? [];
        list.push({ description: event.description, result: event.result });
        this.yields.set(event.coroutineId, list);
      }
      if (event.type === "close") {
        this.closes.set(event.coroutineId, event);
      }
    }
  }

  /**
   * Returns the next unconsumed yield for this coroutine,
   * or undefined if the cursor is past the end.
   */
  peekYield(coroutineId: CoroutineId): { description: EffectDescription; result: Result } | undefined {
    const list = this.yields.get(coroutineId);
    const cursor = this.cursors.get(coroutineId) ?? 0;
    return list?.[cursor];
  }

  /** Advances the cursor for this coroutine by one position. */
  consumeYield(coroutineId: CoroutineId): void {
    const cursor = this.cursors.get(coroutineId) ?? 0;
    this.cursors.set(coroutineId, cursor + 1);
  }

  /** Returns true if a close event exists for this coroutine. */
  hasClose(coroutineId: CoroutineId): boolean {
    return this.closes.has(coroutineId);
  }

  /** Returns the close event for this coroutine, or undefined. */
  getClose(coroutineId: CoroutineId): Close | undefined {
    return this.closes.get(coroutineId);
  }

  /**
   * Returns true if the cursor for this coroutine has been
   * fully consumed AND a close event exists. This means the
   * coroutine completed in a previous run and can be
   * treated as fully replayed.
   */
  isFullyReplayed(coroutineId: CoroutineId): boolean {
    return this.peekYield(coroutineId) === undefined && this.hasClose(coroutineId);
  }
}
```

### 4.2 Effect handling: replay vs. live

When a generator yields a user-facing effect, the reducer determines
the execution mode for that specific effect based on the replay index
state for the yielding coroutine:

```
generator yields effect with description D
  │
  ├─ entry = replayIndex.peekYield(coroutineId)
  │
  ├─ if entry exists:
  │     ├─ REPLAY PATH
  │     ├─ Compare D against entry.description (see §6)
  │     │    ├─ match → continue
  │     │    └─ mismatch → raise DivergenceError (see §6.2)
  │     ├─ replayIndex.consumeYield(coroutineId)
  │     ├─ Feed entry.result to generator:
  │     │    ├─ status "ok"  → iterator.next(entry.result.value)
  │     │    └─ status "err" → iterator.throw(deserialize(entry.result.error))
  │     └─ effect.enter() is NOT called
  │
  └─ if no entry:
        ├─ LIVE PATH
        ├─ effect.enter(callback)
        │    ... effect runs asynchronously or synchronously ...
        │    effect resolves with result R
        ├─ stream.append({ type: "yield", coroutineId, description: D, result: R })
        │    ↑ DURABLE WRITE — must complete before next step (see §5)
        ├─ Feed R to generator:
        │    ├─ status "ok"  → iterator.next(R.value)
        │    └─ status "err" → iterator.throw(deserialize(R.error))
        └─ continue
```

### 4.3 Replay-to-live transition

The transition from replay to live execution occurs **per-coroutine** when
the replay index cursor for that coroutine exceeds the available entries.
There is no global mode switch. At any given moment, some coroutines may
be replaying while others are executing live.

This per-coroutine transition is what enables partial replay of scope trees
that span crash boundaries (see §4.4).

> **INVARIANT (Transparency):** The generator produces identical behavior
> whether driven by replay or live execution. The reducer is the only
> component that differs between modes. No mechanism exists for a generator
> to detect which mode is active.

### 4.4 Partial replay of scope trees

When the runtime resumes from a stream produced by a crashed previous run,
the scope tree may be partially complete: some children finished, others
did not. The runtime reconstructs the tree as follows:

1. **Coroutines with `Close` events** are fully replayed. Their yields are
   fed from the index, and their terminal state is read from the `Close`
   event. The generator for a fully-closed coroutine may be instantiated
   and driven through its replay to reconstruct any in-memory state the
   parent needs from the child's return value, or the return value may be
   read directly from the `Close` event's result if the parent accesses
   it only through a join.

2. **Coroutines with `Yield` events but no `Close` event** are partially
   replayed. Their recorded yields are fed from the index (replay mode),
   then execution continues live from the first unrecorded effect. The
   generator transitions seamlessly at the per-coroutine boundary.

3. **Coroutines with no events at all** were never reached in the previous
   run (the crash occurred before they were spawned). They execute entirely
   live.

4. **The parent's join** waits for all children regardless of their replay
   status. Children in cases 1 and 3 above may complete quickly (or
   instantly, for case 1), while children in case 2 block on their first
   live effect. The join does not distinguish replayed from live children.

> **INVARIANT (Fork-Join Across Crash Boundaries):** A parent's join
> must produce the same result regardless of which children were fully
> replayed, partially replayed, or executed entirely live. The final
> result depends only on the children's results, not on how those
> results were obtained.

---

## 5. The persist-before-resume invariant

This section describes the single most critical correctness property of
the protocol.

> **HARD INVARIANT (Persist-Before-Resume):** A `Yield` event recording
> the resolution of effect N MUST be durably persisted before
> `iterator.next(resultN)` or `iterator.throw(errorN)` is called to
> resume the generator. Violation of this invariant creates
> unrecoverable replay gaps.

### 5.1 Why this is a hard invariant

If the generator advances past a yield point whose resolution is not in
the stream, a crash at any subsequent point makes correct replay
impossible. The stream records effects 0 through N−1. On restart, the
reducer replays those N effects and then expects effect N from the
generator. But the generator, given the same resolutions for 0 through
N−1, will yield effect N — which the reducer executes live. This
re-executes effect N, potentially causing duplicate side effects
(double charges, duplicate messages, etc.).

### 5.2 Interaction with the synchronous reduce loop

The synchronous reduce loop creates a tension with async persistence.
The loop calls `iterator.next(value)` synchronously, but a durable write
to a remote log or disk is inherently asynchronous.

Implementations MUST use one of the following strategies:

**Strategy A: Synchronous local write.** Write the event to a local
write-ahead log (WAL) with `fsync` before resuming the generator.
The reduce loop blocks on the write. This is simple but adds latency
per effect.

**Strategy B: Buffered write with deferred resume.** Instead of
resuming the generator synchronously after effect resolution, enqueue
the resume as a pending instruction. Perform the durable write
asynchronously. Only process the pending resume instruction after
durability is confirmed. This preserves the synchronous reduce loop's
structure while allowing async I/O.

**Strategy C: Batch write at tick boundary.** When multiple effects
resolve in the same reducer tick (e.g., several children in a
`fork/join` completing simultaneously during replay), batch their
`Yield` events into a single durable write. Resume all generators
only after the batch is persisted. This amortizes write latency
across concurrent children.

> **REQUIREMENT:** Implementations MUST document which persistence
> strategy they use and MUST include a test that verifies a crash
> between effect resolution and the next `iterator.next()` call does
> not advance the generator past a non-durable point (see §9, Test 6).

---

## 6. Divergence detection

### 6.1 Matching rules

During replay, each yielded effect's `EffectDescription` is compared
against the corresponding journal entry's description. The comparison
uses only the `type` and `name` fields — extra fields on
`EffectDescription` beyond `type` and `name` are never compared during
divergence detection:

| Yielded | Recorded | Result |
|---------|----------|--------|
| Same type, same name | — | **Match.** Consume entry, feed result. Extra fields are ignored. |
| Different type | — | **Hard divergence.** Always fatal. |
| Same type, different name | — | **Hard divergence** (default). Configurable to warning for specific migration scenarios. |

> **INVARIANT (Divergence Detection):** During replay, every yielded
> effect MUST be validated against the corresponding journal entry
> before its stored result is fed to the generator. A mismatch in
> effect type is always a fatal `DivergenceError`.

### 6.2 `DivergenceError`

A `DivergenceError` is raised when the replay index entry at the current
cursor position does not match the effect yielded by the generator. The
error includes:

```typescript
class DivergenceError extends Error {
  coroutineId: CoroutineId;
  position: number;         // cursor position within the coroutine
  expected: EffectDescription;  // from the journal
  actual: EffectDescription;    // from the generator
}
```

A `DivergenceError` is **not recoverable**. The workflow cannot continue
because the generator's execution path has diverged from the recorded
history. The runtime MUST halt the workflow and surface the error to
the operator.

### 6.3 Terminal divergence cases

Beyond per-effect matching, the reducer detects two additional
divergence conditions:

**Generator finishes early.** The generator returns `{ done: true }`
while the replay index still has unconsumed entries for this coroutine.
This means the current code produces fewer effects than the recorded
run — effects were removed without a version gate.

**Journal exhausted with close but generator continues.** The replay
index has a `Close` event for this coroutine but the generator has not
finished after consuming all recorded yields. This means the current
code produces more effects than the recorded run — effects were added
without a version gate.

Both cases raise `DivergenceError`.

### 6.4 What is NOT checked

- **Extra description fields.** Any fields on `EffectDescription` beyond
  `type` and `name` are stored in the journal but never compared during
  divergence detection. They exist for runtime use (e.g., staleness
  validation by replay guards) and are safe to change between versions.
- **Effect arguments / inputs.** Changes to arguments between versions
  are generally safe. The generator handles whatever value it receives
  from the resolution.
- **Result values.** The stored result is fed to the generator as-is.
  The generator's handling of the value is its own concern.
- **Timing.** Wall-clock time is not part of the protocol.

---

## 7. Structured concurrency semantics

### 7.1 Lifetime invariants

> **INVARIANT (Lifetime Containment):** A child coroutine cannot outlive
> its parent scope. When a scope exits (by completion, error, or
> cancellation), all of its children MUST have terminated.

> **INVARIANT (Single Parent):** Every coroutine has exactly one parent
> scope. The coroutine graph is always a tree, never a DAG.

> **INVARIANT (Implicit Join):** A scope does not exit until all of its
> children have terminated. There is no mechanism to detach a child from
> its parent.

### 7.2 Cancellation

Cancellation propagates **downward** from parent to children, never
upward.

When a scope is cancelled, the runtime cancels its children in **reverse
creation order** (last-created child first). This is a post-order traversal
of the subtree rooted at the cancelled scope: leaves are cancelled before
their parents.

For each cancelled coroutine, the runtime calls `iterator.return()`. This
triggers `finally` blocks in the generator, allowing cleanup. If cleanup
code yields effects, those effects are executed and journaled normally
(in live mode) or replayed (if the cancellation itself is being replayed).

```
cancel(scope)
  │
  ├─ for child in scope.children.reverse():
  │     cancel(child)                         // recurse, leaf-first
  │
  ├─ step = scope.iterator.return(CANCELLED)
  │
  ├─ while not step.done:                    // cleanup may yield effects
  │     effect = step.value
  │     result = handleEffect(effect)         // replay or live, per §4.2
  │     step = scope.iterator.next(result)
  │
  └─ stream.append({ type: "close", coroutineId, result: { status: "cancelled" } })
```

> **INVARIANT (Cancellation Replay Fidelity):** Cancellation events in
> the journal MUST be replayed by calling `iterator.return()` at the
> same journal position, driving the generator through its stored
> cleanup path. The sequence of effects yielded during cleanup MUST
> match the recorded cleanup effects.

### 7.3 Error propagation

Unhandled errors in children propagate **upward** to the parent scope.
The parent's error-handling policy determines the response:

- **Fail-fast (default):** On first child error, cancel all siblings,
  then propagate the error to the parent's parent.
- **Fail-complete:** Collect results from all children. If any failed,
  propagate an aggregate error after all children terminate.
- **Error boundary:** The parent catches the error via `try/catch` in
  the generator. Siblings are not cancelled. Execution continues.

The policy is determined by the concurrency combinator (`race` uses
fail-fast, `all` may use either, `spawn` within `try/catch` enables
error boundaries). The policy is not recorded in the journal — it is
a property of the code, which is deterministic.

### 7.4 Deterministic shutdown ordering

When a scope exits for any reason, cleanup proceeds in this order:

1. Cancel all children in reverse creation order (§7.2).
2. Run the scope's own `ensure()` / `finally` blocks.
3. Write the scope's `Close` event to the stream.
4. Deliver the scope's result to the parent (via the parent's
   pending join or the resolution of a `spawn` effect).

This ordering is deterministic because creation order is deterministic
(§3.2) and reverse creation order is therefore also deterministic.

---

## 8. Causal ordering

> **INVARIANT (Causal Ordering):** Events in the stream MUST appear in
> an order consistent with causal dependency. If event A causally
> depends on event B (e.g., a parent's yield that consumes a child's
> return value depends on the child's `Close` event), then B MUST
> appear before A in the stream.

The synchronous reduce loop guarantees this during live execution:
a parent cannot yield an effect that depends on a child's result until
the child has completed and its `Close` event has been appended. During
replay, the stream is read in append order, so causal ordering is
preserved by construction.

This invariant is what makes the per-coroutine cursor model correct.
Each coroutine's cursor advances independently, but the cursors advance
in an order consistent with the global causal order — a parent's cursor
never advances past a point that depends on a child result that hasn't
been replayed yet.

---

## 9. Version gates

When workflow code changes in a way that alters the effect sequence
(adding, removing, or reordering yields), a **version gate** allows a
single codebase to handle both in-flight (old) and new workflow
instances.

### 9.1 Mechanism

A version gate is itself a yielded effect:

```typescript
const version = yield* versionCheck("add-fraud-check", { minVersion: 0, maxVersion: 1 });
```

On first execution (live mode), the reducer records a `Yield` event
with description `{ type: "version_gate", name: "add-fraud-check" }`
and result `{ status: "ok", value: 1 }` (the max version).

On replay, the stored version determines which code path executes:

```typescript
function* orderWorkflow(orderId: string) {
  const version = yield* versionCheck("add-fraud-check", { minVersion: 0, maxVersion: 1 });

  if (version >= 1) {
    yield* call(fraudCheck, orderId);  // new step, v1+
  }

  const order = yield* call(fetchOrder, orderId);
  yield* call(chargeCard, order.payment);
}
```

### 9.2 Lifecycle

Version gates follow a three-phase lifecycle:

1. **Add gate.** Deploy code with both old (v0) and new (v1) paths.
   In-flight workflows replay with v0. New workflows execute with v1.
2. **Deprecate old path.** Once all v0 workflows have completed, the
   v0 code path is dead but retained for safety.
3. **Remove gate.** Once all v1 workflows from the deprecation era
   have completed, remove the gate and the old code path entirely.

### 9.3 Alternative: immutable deployments

Instead of version gates, the runtime may support immutable deployments
where in-flight workflows always resume on the original code version.
In this model, version gates are unnecessary — the runtime routes each
workflow to the deployment endpoint that created it.

This specification supports both approaches. The choice is an
operational concern, not a protocol concern — the stream format is
identical either way.

---

## 10. Race semantics and cancellation ordering in the journal

`race()` creates a scope with multiple children where the first child
to complete determines the result. Remaining children are cancelled.

### 10.1 Journal structure for a race

Consider `race([op1, op2])` where `op1` wins after `op2` has partially
executed:

```
[0] yield  root.0.1  { type: "call", name: "step1" }  result: ok ...   // op2's first effect
[1] yield  root.0.0  { type: "call", name: "fetch" }  result: ok ...   // op1 completes
[2] close  root.0.0  result: ok                                        // op1 done — op1 wins
[3] close  root.0.1  result: cancelled                                 // op2 cancelled
[4] close  root.0    result: ok                                        // race scope returns op1's result
```

The interleaving of events from `root.0.0` and `root.0.1` reflects
the actual execution order. The journal preserves this interleaving.

### 10.2 Replay of races with partial children

During replay, the reducer processes events in stream order. When it
encounters `close root.0.1 cancelled` in the journal, it knows to
call `iterator.return()` on `root.0.1`'s generator after replaying
that coroutine's recorded yields.

The per-coroutine cursor model handles this correctly because:

1. `root.0.1` has one yield entry (at position 0 of its cursor).
2. After replaying that yield, the cursor is exhausted.
3. The `Close` event with `status: "cancelled"` tells the reducer
   to call `iterator.return()` rather than waiting for more yields.

> **REQUIREMENT:** The runtime MUST use `Close` events with
> `status: "cancelled"` as the trigger for cancellation during replay.
> The cancellation point for a coroutine during replay is determined by
> the position of its `Close(cancelled)` event relative to its last
> `Yield` event — the coroutine is cancelled after its last recorded
> yield has been replayed.

### 10.3 Interleaving and the per-coroutine cursor model

The per-coroutine cursor model groups yields by coroutine ID, which
discards the original interleaving information from the flat stream.
This is acceptable because interleaving order between sibling coroutines
does not affect replay correctness — each coroutine's yield sequence is
independent, and the reducer feeds results from each coroutine's own
cursor.

The only ordering that matters across coroutines is **causal** ordering
(§8), which is encoded in the `Close` events: a parent cannot proceed
past a join until all children have `Close` events.

---

## 11. Stream format

### 11.1 Logical structure

The stream is an ordered, append-only sequence of `DurableEvent` values.
Each event occupies a unique position (offset) in the stream. Offsets
are monotonically increasing integers starting from 0.

```
offset 0: DurableEvent
offset 1: DurableEvent
offset 2: DurableEvent
...
```

### 11.2 Physical encoding

This specification does not prescribe a physical encoding. Implementations
may use JSON, MessagePack, Protobuf, or any other format that can
faithfully represent the `DurableEvent` type. The encoding must preserve:

- Event type (`"yield"` or `"close"`)
- Coroutine ID (string)
- Effect description (for `Yield` events): type and name fields
- Result (status, value, error as applicable)
- Append order (events must be readable in the order they were written)

### 11.3 Stream consistency

> **INVARIANT (Append-Only):** Events are only appended, never updated
> or deleted.

> **INVARIANT (Prefix-Closed):** If event at offset N exists, events
> at offsets 0 through N−1 must also exist. There are no gaps.

> **INVARIANT (Monotonic Indexing):** The event at offset N was the
> (N+1)th event written to the stream.

### 11.4 Example: sequential workflow

Workflow:
```typescript
function* pipeline() {
  yield* sleep(2000);
  const result = yield* call(transform, "alpha");
  return result;
}
```

Stream:
```
[0] yield  root.0  { type: "sleep", name: "sleep" }      result: { status: "ok" }
[1] yield  root.0  { type: "call",  name: "transform" }  result: { status: "ok", value: "ALPHA" }
[2] close  root.0  result: { status: "ok", value: "ALPHA" }
[3] close  root    result: { status: "ok", value: "ALPHA" }
```

### 11.5 Example: fork/join with `all()`

Workflow:
```typescript
function* parallel() {
  const [a, b] = yield* all([
    call(fetchUser, "alice"),
    call(fetchUser, "bob"),
  ]);
  yield* call(merge, a, b);
  return "done";
}
```

Stream:
```
[0] yield  root.0.0  { type: "call", name: "fetchUser" }  result: { status: "ok", value: { name: "alice" } }
[1] yield  root.0.1  { type: "call", name: "fetchUser" }  result: { status: "ok", value: { name: "bob" } }
[2] close  root.0.0  result: { status: "ok", value: { name: "alice" } }
[3] close  root.0.1  result: { status: "ok", value: { name: "bob" } }
[4] yield  root.0    { type: "call", name: "merge" }      result: { status: "ok", value: "merged" }
[5] close  root.0    result: { status: "ok", value: "done" }
[6] close  root      result: { status: "ok", value: "done" }
```

### 11.6 Example: race with cancellation

Workflow:
```typescript
function* timeout() {
  return yield* race([
    call(fetchData),
    sleep(5000),
  ]);
}
```

`fetchData` wins:
```
[0] yield  root.0.0  { type: "call",  name: "fetchData" }  result: { status: "ok", value: { data: 42 } }
[1] close  root.0.0  result: { status: "ok", value: { data: 42 } }
[2] close  root.0.1  result: { status: "cancelled" }
[3] close  root.0    result: { status: "ok", value: { data: 42 } }
[4] close  root      result: { status: "ok", value: { data: 42 } }
```

Timeout wins (fetchData was slow, had partially executed):
```
[0] yield  root.0.0  { type: "call", name: "fetchData.step1" }  result: { status: "ok", value: ... }
[1] yield  root.0.1  { type: "sleep", name: "sleep" }           result: { status: "ok" }
[2] close  root.0.1  result: { status: "ok" }
[3] close  root.0.0  result: { status: "cancelled" }
[4] close  root.0    result: { status: "ok" }
[5] close  root      result: { status: "ok" }
```

---

## 12. Infrastructure effects

Not all effects are recorded. The runtime distinguishes between
**user-facing effects** (which are durable) and **infrastructure effects**
(which are not).

### 12.1 Classification

**User-facing effects** interact with the outside world or represent
decisions that must be preserved across restarts. Examples:

- `call(fn, ...args)` — invoke an external function
- `sleep(ms)` — wait for a duration
- `action(description)` — wait for an external event

**Infrastructure effects** manage the runtime's internal structure.
Examples:

- `useScope()` — obtain a reference to the current scope
- Scope middleware hooks
- Internal bookkeeping (counter management, queue operations)

### 12.2 Rule

Infrastructure effects are executed live during both replay and live
modes. They are never recorded in the stream and never appear in the
replay index. Their results are deterministic by construction (they
depend only on the runtime's internal state, which is reconstructed
identically during replay because the user-facing effects that shaped
it are replayed).

> **REQUIREMENT:** The boundary between user-facing and infrastructure
> effects MUST be documented by the runtime implementation. An effect
> that is classified as infrastructure MUST NOT have observable external
> side effects and MUST produce the same result during replay as during
> live execution.

---

## 13. Invariant summary

For reference, the complete set of invariants defined in this specification:

| # | Name | Section | Scope |
|---|------|---------|-------|
| 1 | Deterministic Identity | §3.3 | Coroutine IDs are stable across runs |
| 2 | Transparency | §4.3 | Generator cannot detect replay vs. live |
| 3 | Fork-Join Across Crash Boundaries | §4.4 | Join result is independent of replay status |
| 4 | Persist-Before-Resume | §5 | Durable write before generator advance |
| 5 | Divergence Detection | §6.1 | Every replayed effect is validated |
| 6 | Lifetime Containment | §7.1 | child ⊆ parent |
| 7 | Single Parent | §7.1 | Tree, not DAG |
| 8 | Implicit Join | §7.1 | Scope waits for all children |
| 9 | Cancellation Replay Fidelity | §7.2 | Cleanup path matches recorded path |
| 10 | Causal Ordering | §8 | Stream order respects causality |
| 11 | Append-Only | §11.3 | No mutation or deletion |
| 12 | Prefix-Closed | §11.3 | No gaps in the stream |
| 13 | Monotonic Indexing | §11.3 | Sequential offsets |

---

## 14. Test plan

### Tier 1 — Core replay correctness

These tests MUST pass for the protocol to be considered implemented.

| # | Test | Procedure | Verify |
|---|------|-----------|--------|
| 1 | **Golden run** | Execute workflow end-to-end with no interruption. | Stream contains expected events; final result is correct. |
| 2 | **Full replay** | Replay entire stream against same code. | No effects re-executed; no divergence; same result. |
| 3 | **Crash before first effect** | Provide empty stream to workflow. | All effects execute live; stream matches golden run. |
| 4 | **Crash at position N** | Provide first N events from golden stream. | First N effects replayed (not re-executed); remaining execute live; same result. |
| 5 | **Crash after last effect** | Provide all `Yield` events but no `Close` events. | All effects replayed; close events written; same result. |
| 6 | **Persist-before-resume verification** | Inject crash between effect resolution and `iterator.next()`. | On resume, the resolved effect is in the stream; no replay gap; no duplicate execution. |
| 7 | **Actor handoff** | Process A writes first N events, terminates. Process B reads stream, resumes. | B replays N events (none re-executed), continues live; correct result. |

### Tier 2 — Divergence detection

| # | Test | Procedure | Verify |
|---|------|-----------|--------|
| 8 | **Added step** | Record stream with code v1. Replay with v2 that adds an effect before existing ones. | `DivergenceError` at position 0 with expected vs. actual descriptions. |
| 9 | **Removed step** | Record with v1. Replay with v2 that removes an effect. | `DivergenceError` at the position where removed effect was expected. |
| 10 | **Reordered steps** | Record with v1. Replay with v2 that swaps two effects. | `DivergenceError` at first swapped position. |
| 11 | **Type mismatch** | Record a `call` effect. Replay code yields `sleep` at same position. | `DivergenceError` citing type mismatch. |
| 12 | **Name mismatch** | Record `call("fetchOrder")`. Replay yields `call("chargeCard")`. | `DivergenceError` citing name mismatch. |
| 13 | **Generator finishes early** | Record stream with 5 yields + close. Replay code produces only 3 yields then returns. | `DivergenceError`: generator completed with unconsumed journal entries. |
| 14 | **Generator continues past close** | Record stream with close after 3 yields. Replay code produces 5 yields. | `DivergenceError`: journal shows close but generator hasn't finished. |

### Tier 3 — Structured concurrency

| # | Test | Procedure | Verify |
|---|------|-----------|--------|
| 15 | **Fork/join — all children complete before crash** | Parent forks 3 children, all complete; crash before parent's post-join effect. | All child results replayed from stream; parent continues live. |
| 16 | **Fork/join — partial completion** | 2 of 3 children complete before crash. | 2 replayed, 1 re-executes from its last yield; correct join result. |
| 17 | **Nested scopes** | Crash inside doubly-nested scope. | Scope tree reconstructed; inner scope partially replayed; outer scope waits correctly. |
| 18 | **Cancellation propagation** | Cancel parent while children run. | Children cancelled in reverse order; `finally` blocks run; `Close(cancelled)` events written. |
| 19 | **Cancellation replay** | Replay a stream that contains cancellation events. | `iterator.return()` called at correct positions; cleanup effects replayed; no divergence. |
| 20 | **Error in child — sibling cancellation** | Child A throws; siblings cancelled. | Siblings cancelled in reverse order; error propagated to parent; cleanup recorded. |
| 21 | **Error boundary** | Child error caught by parent `try/catch`. | Parent catches error; siblings NOT cancelled; execution continues. |
| 22 | **Race — winner cancels losers** | `race([op1, op2])`, op1 wins. | op2 receives `Close(cancelled)`; race returns op1's result. |
| 23 | **Race replay with partial loser** | Replay race where loser partially executed. | Loser's partial yields replayed, then cancelled at correct point. |

### Tier 4 — Deterministic identity

| # | Test | Procedure | Verify |
|---|------|-----------|--------|
| 24 | **Stable IDs across runs** | Execute workflow twice with same inputs/resolutions. | Coroutine IDs identical in both runs. |
| 25 | **Stable IDs: live vs. replay** | Execute workflow live. Execute same workflow via full replay. | Coroutine IDs identical. |
| 26 | **Spawn during teardown** | `ensure()` block inside `all()` child spawns a new child. | Teardown child's coroutine ID identical between live and replay. |
| 27 | **Dynamic spawn count divergence** | Record stream with `all([a, b])`. Replay with `all([a, b, c])`. | `DivergenceError` (c produces yields not in journal, or parent's post-join effect mismatches). |

### Tier 5 — Versioning

| # | Test | Procedure | Verify |
|---|------|-----------|--------|
| 28 | **Version gate — old workflow** | Stream from v0 code. Replay with code containing version gate. | Gate reads v0; old path executes; no divergence. |
| 29 | **Version gate — new workflow** | Execute with version gate, no prior stream. | Gate records v1; new path executes; stream contains version marker. |

### Tier 6 — Edge cases

| # | Test | Procedure | Verify |
|---|------|-----------|--------|
| 30 | **Empty workflow** | Workflow with zero yields. | Completes immediately; stream has only `Close` events; replay is no-op. |
| 31 | **Effect that throws** | Effect resolves with error; generator catches. | Stream records error result; replay injects via `iterator.throw()`; catch path executes. |
| 32 | **Truncated stream** | Remove last N events from valid stream. | Runtime detects incomplete state; re-executes from truncation point; no silent corruption. |
| 33 | **Systematic crash-point sweep** | For workflow with M yields, run M+1 crash-resume cycles. | Every crash point produces correct final result; replayed effects not re-executed. |

### Tier 7 — Property-based tests

| # | Property | Strategy |
|---|----------|----------|
| 34 | **Crash-resume equivalence** | For any workflow and any set of crash points, the final result equals the uninterrupted result. |
| 35 | **Journal monotonicity** | After any operation sequence, stream length is non-decreasing and offsets are sequential. |
| 36 | **Replay idempotency** | Replaying the same stream K times produces the same effect sequence every time. |
| 37 | **Random workflow fuzzing** | Generate random workflow shapes (varying depth, fork count, error/cancel injection). Verify all invariants hold. |
