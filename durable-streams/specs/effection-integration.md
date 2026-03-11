# Durable Execution for Effection: Architecture Research

**Status:** Validated through implementation — Tier 1-4 tests passing
**Audience:** Charles, Taras
**Inputs:** Two-event durable execution spec (v2), Effection source, AGENTS.md, Charles's type-constraint feedback, implementation + DECISIONS.md

---

## 1. Executive summary

This document maps the two-event durable execution protocol onto Effection's
runtime architecture and incorporates Charles's insight that **type-level
constraints** should replace runtime effect classification. The design has
been **validated through implementation** — all four tiers of tests pass:
core replay (Tier 1), divergence detection (Tier 2), structured concurrency
(Tier 3), and deterministic identity (Tier 4). Key conclusions:

- Effection's reducer does not need to change.
- Durability is implemented entirely within a new `DurableEffect` type whose
  `enter()` method handles replay, divergence detection, and persist-before-resume.
- A `Workflow<T>` type constrains generators at compile time so that only
  durable-safe effects can be yielded. All `Workflow`s are `Operation`s, but
  not all `Operation`s are `Workflow`s. No casts needed at the boundary (DEC-015).
- Structured concurrency combinators (`durableSpawn`, `durableAll`,
  `durableRace`) return `Workflow<T>` — they self-wrap their infrastructure
  effects in `ephemeral()` and delegate to Effection's native `spawn()`,
  `all()`, `race()`. Child signatures are tightened to `() => Workflow<T>`;
  bare Operations are rejected at compile time. A shared `runDurableChild`
  helper handles DurableContext setup, Close events, and the `suspend()`
  trick for replaying cancelled children.
- An `ephemeral<T>(operation: Operation<T>): Workflow<T>` adapter provides
  an explicit escape hatch (analogous to Rust's `unsafe {}`) for running
  non-durable Operations inside Workflows. It is transparent to the journal
  and re-runs on replay. See DEC-034.
- The Durable Streams protocol provides a strong backend fit (see companion
  document `durable-streams.md`).

**Implementation artifacts:** The `@effectionx/durable-streams` package
contains 12 modules (types, replay-index, effect, operations, combinators,
each, ephemeral, run, context, stream, http-stream, serialize) plus `mod.ts`
as the public API barrel. Test files (`*.test.ts`) cover types, replay-index,
durable-run (Tier 1), divergence (Tier 2), structured-concurrency (Tier 3),
deterministic-id (Tier 4), durable-each, ephemeral, and http-stream (backend
adapter). 34 architectural decisions recorded in `DECISIONS.md`.

---

## 2. The protocol (fixed contract)

The spec defines exactly two event types in an append-only stream:

```typescript
type DurableEvent = Yield | Close;

interface Yield {
  type: "yield";
  coroutineId: CoroutineId;      // e.g. "root.0.1"
  description: EffectDescription; // { type, name }
  result: Result;
}

interface Close {
  type: "close";
  coroutineId: CoroutineId;
  result: Result;                 // ok | err | cancelled
}

interface EffectDescription {
  type: string;   // "call", "sleep", "action", etc.
  name: string;   // "fetchOrder", "sleep", etc.
  [key: string]: Json;  // extra fields stored verbatim, never compared
}

type Result =
  | { status: "ok"; value?: Json }
  | { status: "err"; error: SerializedError }
  | { status: "cancelled" };
```

**Yield** is written after an effect resolves. It records what was requested
(description) and what happened (result). During replay the description is
validated and the result is fed directly to the generator.

**Close** is written when a coroutine terminates (completed, failed, or
cancelled). Close events are load-bearing for partial replay — they tell the
runtime which scopes completed before a crash and which need re-execution.

### 2.1 Core invariants from the spec

| # | Name | Rule |
|---|------|------|
| 1 | Deterministic Identity | Coroutine IDs are stable across runs for same code + same resolutions |
| 2 | Transparency | Generator cannot detect replay vs. live |
| 3 | Fork-Join Across Crash | Join result is independent of which children were replayed |
| 4 | **Persist-Before-Resume** | Durable write MUST complete before `iterator.next()` is called |
| 5 | Divergence Detection | Every replayed effect is validated against journal |
| 6 | Lifetime Containment | child ⊆ parent |
| 7 | Single Parent | Tree, not DAG |
| 8 | Implicit Join | Scope waits for all children |
| 9 | Cancellation Replay Fidelity | Cleanup path matches recorded path |
| 10 | Causal Ordering | Stream order respects causality |
| 11–13 | Stream consistency | Append-only, prefix-closed, monotonic indexing |

---

## 3. How Effection's runtime works (relevant internals)

### 3.1 The reducer loop

`lib/reducer.ts` — the synchronous, re-entrant loop that drives all execution:

```typescript
class Reducer {
  reducing = false;
  readonly queue = new InstructionQueue();  // min-heap priority queue, shallower scopes first

  reduce = (instruction: Instruction) => {
    this.queue.enqueue(instruction);
    if (this.reducing) return;              // re-entrancy guard
    try {
      this.reducing = true;
      let item = this.queue.dequeue();
      while (item) {
        let [, routine, result, _, method] = item;
        let iterator = routine.data.iterator;
        // Call iterator.next(value), iterator.throw(error), or iterator.return(value)
        let next = iterator[method](result.value);
        if (!next.done) {
          let action = next.value;          // the yielded Effect<T>
          routine.data.exit = action.enter(routine.next, routine);
        }
        item = this.queue.dequeue();
      }
    } finally {
      this.reducing = false;
    }
  };
}
```

Key properties:
- **Synchronous.** No `await` anywhere. Async effects resolve by calling
  `routine.next(result)` from a callback, which re-enters `reduce()`.
- **Re-entrant safe.** If `reduce()` is already running, the instruction is
  enqueued and the outer loop picks it up.
- **Priority ordered.** Shallower (parent) scopes run first (FIFO within a tier).
  This is structural, not timing-dependent — it's deterministic.

### 3.2 The Effect interface

```typescript
interface Effect<T> {
  description: string;
  enter(
    resolve: Resolve<Result<T>>,
    routine: Coroutine,
  ): (resolve: Resolve<Result<void>>) => void;
}
```

Every yielded value from a generator is an `Effect`. The reducer calls
`enter()`, which:
1. Starts the actual work (sets timers, makes requests, etc.)
2. Calls `resolve(result)` when done — this enqueues the next instruction
3. Returns a teardown function called during cancellation/scope exit

### 3.3 How existing effects use enter()

**Synchronous / infrastructure effects** call `resolve()` immediately inside
`enter()`:

```typescript
// useScope() — lib/context.ts
function UseScope<T>(fn: (scope: Scope) => T, description: string): Effect<T> {
  return {
    description,
    enter: (resolve, { scope }) => {
      resolve(Ok(fn(scope)));           // resolve immediately
      return (resolve) => resolve(Ok());
    },
  };
}
```

**Asynchronous / user-facing effects** call `resolve()` later from a callback:

```typescript
// sleep() — lib/sleep.ts, via action()
function sleep(duration: number): Operation<void> {
  return action((resolve) => {
    let timeoutId = setTimeout(resolve, duration);  // resolve later
    return () => clearTimeout(timeoutId);
  });
}
```

### 3.4 The type system today

```typescript
interface Operation<T> {
  [Symbol.iterator](): Iterator<Effect<unknown>, T, unknown>;
}
```

An `Operation` is anything whose iterator yields `Effect` values. Generator
functions (`function*`) that only do `yield*` to other operations satisfy this.
The `yield*` delegation means the inner generator's yielded `Effect` values
pass through to the outer generator — the reducer sees a flat sequence of
effects regardless of call depth.

### 3.5 Scope, Context, and Api systems

- **Scope** (`lib/scope-internal.ts`): tree-structured, owns lifetime and
  context. Created via `createScopeInternal(parent)`. Tracks children via
  `Children` context. Destruction runs `ensure()` callbacks in reverse order.

- **Context** (`lib/context.ts`): scope-local key-value storage. Children
  inherit from parents. `createContext<T>(name, default?)` creates a typed
  context. Accessed via `scope.get()`, `scope.set()`, `scope.expect()`.

- **Api** (`lib/api.ts`): middleware system for scope-bound operations.
  `scope.around(api, middlewares, { at: "min" | "max" })` installs
  middleware at different priority layers. Used for `Scope.create`,
  `Scope.destroy`, and `Main.main`.

### 3.6 Task lifecycle

`createTask()` in `lib/task.ts`:

1. Creates a child scope via `createScopeInternal(owner)`
2. Creates a `Future<T>` for the task's result
3. Creates a `Delimiter` (error/cancellation boundary)
4. Registers an `ensure()` on the scope that:
   - Closes the delimiter
   - Resolves or rejects the future
   - Propagates errors to the parent boundary
5. Creates a coroutine and returns a `start()` function

The ensure callback provides a natural lifecycle hook, but the durable
execution implementation uses try/catch/finally in `runDurableChild`
instead (see §8.1). This avoids introducing infrastructure effects into
the child's generator — try/finally is just JavaScript.

---

## 4. Charles's type-constraint architecture (validated)

The following design was proposed by Charles and has been validated
through implementation. Key confirmation: DEC-009 (`Workflow<T>` =
`Generator<DurableEffect<unknown>, T, unknown>` enforces yield
constraints at compile time) and DEC-015 (`Workflow<T>` is directly
assignable to `Operation<T>` — no casts needed).

### 4.1 The problem with runtime classification

The spec's §12 distinguishes "user-facing" from "infrastructure" effects. My
initial analysis proposed classifying them at runtime — e.g., effects that
call `resolve()` synchronously inside `enter()` are infrastructure.

Charles correctly identified this as fragile. The failure mode is silent: a
misclassified effect gets skipped during replay with no error. Worse, the
classification is implicit — there's no way to verify it statically, and new
effects could be misclassified without anyone noticing.

### 4.2 The solution: constrain the yield type

Instead of classifying effects after they're yielded, constrain what can be
yielded at the type level:

```typescript
interface DurableEffect<T> {
  description: string;
  effectDescription: EffectDescription;  // { type, name }
  enter(
    resolve: Resolve<EffectionResult<T>>,
    routine: CoroutineView,
  ): (resolve: Resolve<EffectionResult<void>>) => void;
}

type Workflow<T> = Generator<DurableEffect<unknown>, T, unknown>;
```

`DurableEffect<T>` is structurally compatible with `Effect<T>` (same shape plus
the extra `effectDescription` field). `Workflow` uses `Generator` (not `Iterable`)
so TypeScript enforces the yield-type constraint at compile time — yielding a
plain `Effect` inside a `Workflow` generator is a type error.

Key relationships:
- `DurableEffect` is structurally compatible with `Effect` → assignable to `Effect<T>`
- `Workflow` yields `DurableEffect` → every `Workflow` is an `Operation`
- `Operation` yields `Effect` → `Operation` is NOT a `Workflow`
- The reducer processes both identically (it just calls `enter()`)

### 4.3 What this buys us

**Compile-time safety.** If you declare `function*(): Workflow<void>`, the
TypeScript compiler rejects `yield*` to any `Operation` that isn't also a
`Workflow`. Using `useAbortSignal()`, `sleep()`, or `each(stream)` inside a
workflow is a type error.

```typescript
function* badWorkflow(): Workflow<void> {
  yield* useAbortSignal();  // TypeError!
  yield* sleep(1000);       // TypeError!
}
```

**No runtime classification.** The reducer doesn't need to know whether an
effect is durable. The `DurableEffect.enter()` method handles its own replay
and persistence logic. The reducer just calls `enter()` as always.

**No reducer changes.** The existing `Reducer.reduce()` loop is untouched.
It processes `DurableEffect` values the same way it processes any `Effect` —
by calling `enter()`, getting a teardown function, and waiting for `resolve()`.

**Clear boundary.** Workflow authors know exactly what they can and can't use.
If it compiles, it's durable. There's no hidden gotcha where "this operation
looks safe but actually breaks replay."

**Uniform Workflow typing.** Combinators (`durableAll`, `durableRace`,
`durableSpawn`) self-wrap their infrastructure effects in `ephemeral()` and
return `Workflow<T>`, so top-level workflows that use combinators can also be
typed as `Workflow<T>`. Child signatures are tightened to `() => Workflow<T>`
— bare Operations are rejected at compile time. Users who intentionally need
non-durable Operations inside a Workflow use `ephemeral()` as an explicit
escape hatch (analogous to Rust's `unsafe {}`). See DEC-034.

### 4.4 The freeing quality

Charles's observation: workflow authors don't need to understand whether they're
running durably. The type system enforces it. You write workflows using
workflow-enabled effects, and the compiler guarantees the result is safe for
durable execution. There's no "am I in replay mode?" question — the
`DurableEffect.enter()` handles that transparently.

---

## 5. DurableEffect implementation (validated)

The following design is implemented in `effect.ts` and tested
across Tier 1-2 (14 tests passing).

### 5.1 The enter() method does everything

The central insight: each `DurableEffect` handles its own replay/live dispatch
inside `enter()`. It reads the durable execution context from the scope,
checks the replay index, and either feeds the stored result or executes live
with persistence.

```typescript
interface DurableContext {
  replayIndex: ReplayIndex;
  stream: DurableStream;
  coroutineId: CoroutineId;
  childCounter: number;
}

const DurableCtx = createContext<DurableContext>("@effection/durable");

type Executor = (
  resolve: (result: Result) => void,
  reject: (error: Error) => void,
) => () => void;

function createDurableEffect<T>(
  desc: EffectDescription,
  execute: Executor,
): DurableEffect<T> {
  return {
    description: `${desc.type}(${desc.name})`,
    effectDescription: desc,
    enter(resolve, routine) {
      const ctx = routine.scope.expect<DurableContext>(DurableCtx);
      const entry = ctx.replayIndex.peekYield(ctx.coroutineId);

      if (entry) {
        // ── REPLAY PATH ──
        // §6.2: Validate description match.
        // Only `type` and `name` are compared — extra fields on
        // EffectDescription are intentionally not compared.
        if (entry.description.type !== desc.type ||
            entry.description.name !== desc.name) {
          const cursor = ctx.replayIndex.getCursor(ctx.coroutineId);
          resolve({
            ok: false,
            error: new DivergenceError(
              ctx.coroutineId, cursor, entry.description, desc
            ),
          });
          return (exit) => exit(VOID_OK);
        }

        ctx.replayIndex.consumeYield(ctx.coroutineId);

        // Feed stored result synchronously — no I/O, no side effects.
        // Convert from protocol Result to Effection Result.
        resolve(protocolToEffection<T>(entry.result));
        return (exit) => exit(VOID_OK);
      }

      // No replay entry. Check for continue-past-close divergence (§6.3).
      if (ctx.replayIndex.hasClose(ctx.coroutineId)) {
        resolve({
          ok: false,
          error: new ContinuePastCloseDivergenceError(
            ctx.coroutineId,
            ctx.replayIndex.yieldCount(ctx.coroutineId),
          ),
        });
        return (exit) => exit(VOID_OK);
      }

      // ── LIVE PATH ──

      function persistAndResolve(result: Result): void {
        const event: Yield = {
          type: "yield",
          coroutineId: ctx.coroutineId,
          description: desc,
          result,
        };
        // Strategy B: buffered write with deferred resume.
        ctx.stream.append(event).then(
          () => resolve(protocolToEffection<T>(result)),
          (err) => resolve({
            ok: false,
            error: err instanceof Error ? err : new Error(String(err)),
          }),
        );
      }

      // Guard against synchronous throws from the executor
      let teardown: () => void;
      try {
        teardown = execute(
          (result) => persistAndResolve(result),
          (error) => {
            persistAndResolve({
              status: "err",
              error: serializeError(error),
            });
          },
        );
      } catch (e) {
        const error = e instanceof Error ? e : new Error(String(e));
        persistAndResolve({ status: "err", error: serializeError(error) });
        return (exit) => exit(VOID_OK);
      }

      return (exit) => {
        try { teardown(); exit(VOID_OK); }
        catch (e) { exit({ ok: false, error: e as Error }); }
      };
    },
  };
}
```

### 5.2 How this satisfies spec invariants (verified by tests)

**Persist-before-resume (§5, hard invariant).** During live execution,
`resolve()` is called inside the `.then()` callback of the stream append.
The generator does not advance until the durable write completes. This is
the spec's "Strategy B: buffered write with deferred resume." If the
append rejects, the error is delivered through Effection's normal error
channel to avoid hanging the generator.

**Transparency (§4.3).** During replay, `resolve()` is called synchronously
with the stored result (converted via `protocolToEffection()`). The reducer
processes it in the same tick. The generator receives the same value via
the same `iterator.next()` call path. It cannot distinguish replay from live.

**Divergence detection (§6).** The description comparison happens inside
`enter()` before the stored result is fed. A mismatch raises
`DivergenceError` through the normal error propagation path (via
`resolve({ ok: false, error: ... })`). Additionally, the continue-past-close
check detects when the journal has a Close for this coroutine but the
generator yields additional effects beyond what was recorded.

**Result conversion.** The protocol uses `{ status: "ok" | "err" | "cancelled" }`
while Effection uses `{ ok: true, value } | { ok: false, error }`. The
`protocolToEffection()` helper bridges this gap in both replay and live paths.

**Synchronous throw guard.** If the executor throws synchronously (before
returning a teardown function), the error is caught, serialized, and
persisted through the normal `persistAndResolve` path.

**No reducer changes.** The reducer calls `enter()`, gets a teardown,
waits for `resolve()`. Whether `resolve()` fires synchronously (replay)
or asynchronously (live with persistence) is invisible to the reducer.

### 5.3 Replay path performance

During replay, `enter()` is fully synchronous:
1. Read replay index — in-memory map lookup
2. Compare descriptions — two string comparisons
3. Call `resolve()` — enqueues the next reducer instruction
4. Return teardown (no-op)

The reducer's re-entrancy guard means the enqueued instruction is processed
on the next iteration of the existing `while` loop. There is zero async
overhead during replay. A fully-replayed workflow completes in a single
synchronous reduce cycle.

---

## 6. Workflow-enabled effects (validated)

Implemented in `operations.ts`. All four effects (`durableSleep`,
`durableCall`, `durableAction`, `versionCheck`) are tested through the
Tier 1-2 test suites.

### 6.1 durableSleep

```typescript
function* durableSleep(ms: number): Workflow<void> {
  yield createDurableEffect<void>(
    { type: "sleep", name: "sleep" },
    (resolve) => {
      const id = setTimeout(() => resolve({ status: "ok" }), ms);
      return () => clearTimeout(id);
    },
  );
}
```

### 6.2 durableCall

```typescript
function* durableCall<T extends Json>(
  name: string,
  fn: () => Promise<T>,
): Workflow<T> {
  return (yield createDurableEffect<T>(
    { type: "call", name },
    (resolve) => {
      fn().then(
        (value) => resolve({ status: "ok", value: value as Json }),
        (error) => {
          resolve({
            status: "err",
            error: serializeError(
              error instanceof Error ? error : new Error(String(error)),
            ),
          });
        },
      );
      return () => {};
    },
  )) as T;
}
```

### 6.3 durableAction

```typescript
function* durableAction<T extends Json>(
  name: string,
  executor: (
    resolve: (value: T) => void,
    reject: (error: Error) => void,
  ) => () => void,
): Workflow<T> {
  return (yield createDurableEffect<T>(
    { type: "action", name },
    (protocolResolve, reject) => {
      return executor(
        (value: T) =>
          protocolResolve({ status: "ok", value: value as Json }),
        reject,
      );
    },
  )) as T;
}
```

### 6.4 versionGate (§9)

```typescript
function* versionCheck(
  name: string,
  opts: { minVersion: number; maxVersion: number },
): Workflow<number> {
  return (yield createDurableEffect<number>(
    { type: "version_gate", name },
    (resolve) => {
      resolve({ status: "ok", value: opts.maxVersion });
      return () => {};
    },
  )) as number;
}
```

### 6.5 Workflow composition

Workflows compose exactly like operations — via `yield*`:

```typescript
function* orderWorkflow(orderId: string): Workflow<void> {
  let version = yield* versionCheck("add-fraud-check", { minVersion: 0, maxVersion: 1 });

  if (version >= 1) {
    yield* durableCall("fraudCheck", () => fraudCheck(orderId));
  }

  let order = yield* durableCall("fetchOrder", () => fetchOrder(orderId));
  yield* durableCall("chargeCard", () => chargeCard(order.payment));
}
```

---

## 7. Coroutine identity (validated)

### 7.1 Per-parent counter scheme (§3)

Coroutine IDs are dot-delimited paths assigned deterministically:

```
root                    → "root"
  first child of root   → "root.0"
  second child of root  → "root.1"
    first child of .1   → "root.1.0"
```

### 7.2 Implementation via DurableContext

The coroutine ID is part of the `DurableContext` stored on each scope. When
a durable scope spawns a child, it increments a per-scope counter and
constructs the child's ID:

```typescript
interface DurableContext {
  replayIndex: ReplayIndex;
  stream: DurableStream;
  coroutineId: CoroutineId;
  childCounter: number;
}
```

When `durableSpawn()` creates a child scope:

```typescript
let parentCtx = scope.expect(DurableCtx);
let childId = `${parentCtx.coroutineId}.${parentCtx.childCounter++}`;
childScope.set(DurableCtx, {
  replayIndex: parentCtx.replayIndex,  // shared
  stream: parentCtx.stream,            // shared
  coroutineId: childId,
  childCounter: 0,
});
```

### 7.3 Why determinism holds

The spec identifies four properties (§3.2):

1. **Synchronous reducer.** ✅ Effection's `Reducer.reduce()` is synchronous
   with a re-entrancy guard. No async gaps.
2. **Deterministic generators.** ✅ Same inputs → same yields. `for...of` in
   `all()` processes operands in array order.
3. **Replay preserves ordering.** ✅ Replayed effects resolve synchronously
   inside `DurableEffect.enter()`, so spawns happen in the same order.
4. **Priority ordering is structural.** ✅ `PriorityQueue` orders by scope
   depth (the `Priority` context), FIFO within a tier.

### 7.4 Teardown spawns (§3.4)

When `ensure()` or `finally` blocks spawn children during scope destruction,
the `childCounter` continues incrementing on the same `DurableContext`. This
is safe because teardown order is deterministic (reverse creation order via
the scope's destructor set in `buildScopeInternal`).

---

## 8. Scope management: spawn, join, Close events (validated)

Implemented in `combinators.ts`. The actual architecture differs from
earlier sketches — combinators are `Operation` generators (not `DurableEffect`s),
and they delegate to Effection's native `spawn()`, `all()`, and `race()`.

### 8.1 runDurableChild — the core building block

All three combinators share a single helper, `runDurableChild()`, that
wraps any child workflow with DurableContext setup and Close event handling.
This is an `Operation<T>` meant to run inside a `spawn()`:

```typescript
function* runDurableChild<T extends Json | void>(
  childWorkflow: () => Workflow<T> | Operation<T>,
  childId: string,
  parentCtx: DurableContext,
): Operation<T> {
  const { replayIndex, stream } = parentCtx;

  // Short-circuit: child already completed in a previous run
  if (replayIndex.hasClose(childId)) {
    const closeEvent = replayIndex.getClose(childId)!;
    if (closeEvent.result.status === "ok") {
      return closeEvent.result.value as T;
    } else if (closeEvent.result.status === "err") {
      throw deserializeError(closeEvent.result.error);
    } else {
      // Cancelled in previous run — suspend until parent cancels us
      yield* suspend();
      return undefined as T;  // unreachable
    }
  }

  // Set child's DurableContext
  const scope = yield* useScope();
  scope.set(DurableCtx, {
    replayIndex, stream,
    coroutineId: childId,
    childCounter: 0,
  });

  let closeEvent: Close | undefined;
  try {
    const result: T = yield* childWorkflow();
    closeEvent = {
      type: "close", coroutineId: childId,
      result: { status: "ok", value: result as Json },
    };
    return result;
  } catch (error) {
    closeEvent = {
      type: "close", coroutineId: childId,
      result: {
        status: "err",
        error: serializeError(
          error instanceof Error ? error : new Error(String(error)),
        ),
      },
    };
    throw error;
  } finally {
    if (!closeEvent) {
      closeEvent = {
        type: "close", coroutineId: childId,
        result: { status: "cancelled" },
      };
    }
    // Don't re-emit if journal already has this Close
    if (!replayIndex.hasClose(childId)) {
      yield* call(() => stream.append(closeEvent!));
    }
  }
}
```

Key design decisions in this helper:

**Short-circuit on existing Close.** If the journal already has a Close for
this child, `runDurableChild` never runs the workflow. For `ok` and `err`,
it returns/throws immediately. For `cancelled`, it uses `yield* suspend()`
(see §8.4).

**Close events via try/catch/finally.** The `closeEvent` variable starts
undefined. Normal completion sets it in the try block. Errors set it in
catch. If both are skipped (cancellation via `iterator.return()`), it
stays undefined and finally assigns `cancelled`. This covers all three
terminal states with plain JavaScript.

**No re-emission guard.** The `if (!replayIndex.hasClose(childId))` check
in finally prevents writing a duplicate Close when replaying a child that
was already completed. Without this, a fully-replayed child that short-
circuits would emit a second Close event.

**`yield* call()` for stream append.** The finally block uses Effection's
`call()` to await the stream append within generator context, rather than
raw `await`. This keeps the code within Effection's structured concurrency
model.

### 8.2 durableSpawn

Spawns a single durable child. Returns `Operation<Task<T>>` (not
`Workflow<Task<T>>`) because it uses infrastructure effects internally:

```typescript
function* durableSpawn<T extends Json | void>(
  childWorkflow: () => Workflow<T> | Operation<T>,
): Operation<Task<T>> {
  const scope = yield* useScope();
  const ctx = scope.expect<DurableContext>(DurableCtx);
  const childId = `${ctx.coroutineId}.${ctx.childCounter++}`;
  return yield* spawn(() => runDurableChild(childWorkflow, childId, ctx));
}
```

Uses Effection's `spawn()` directly via `yield*`. The child runs
concurrently in its own scope. `runDurableChild` handles DurableContext
setup and Close events.

### 8.3 durableAll

Fork/join — runs all children concurrently, waits for all to complete:

```typescript
function* durableAll<T extends Json | void>(
  workflows: (() => Workflow<T> | Operation<T>)[],
): Operation<T[]> {
  const scope = yield* useScope();
  const ctx = scope.expect<DurableContext>(DurableCtx);

  const childOps: Operation<T>[] = workflows.map((workflow) => {
    const childId = `${ctx.coroutineId}.${ctx.childCounter++}`;
    return {
      *[Symbol.iterator]() {
        return yield* runDurableChild(workflow, childId, ctx);
      },
    };
  });

  return yield* effectionAll(childOps);
}
```

Delegates to Effection's native `all()`, which provides error isolation
via `trap()` internally. When any child fails, remaining siblings are
cancelled — Effection handles this, and `runDurableChild`'s finally block
emits `Close(cancelled)` for each.

### 8.4 Cancellation replay via suspend()

When replaying a child that was cancelled in a previous run (journal has
`Close(cancelled)`), the child cannot simply throw or return — that would
change the control flow the parent combinator sees. Instead, `runDurableChild`
calls `yield* suspend()`, which blocks the child forever.

This works because the parent combinator (`durableRace` or `durableAll`
with a failed sibling) will cancel this child as part of normal structured
concurrency teardown — the same thing that happened in the original run.
The `suspend()` just holds the child alive until that cancellation arrives.

The `Close(cancelled)` event already exists in the journal, so the finally
block's `if (!replayIndex.hasClose(childId))` guard skips re-emission.

This is the only correct approach: it makes replay indistinguishable from
live execution from the parent's perspective. The parent's race/all sees
exactly the same behavior — one child completes, the others get cancelled.

### 8.5 durableRace

First child to complete wins, others cancelled:

```typescript
function* durableRace<T extends Json | void>(
  workflows: (() => Workflow<T> | Operation<T>)[],
): Operation<T> {
  const scope = yield* useScope();
  const ctx = scope.expect<DurableContext>(DurableCtx);

  const childOps: Operation<T>[] = workflows.map((workflow) => {
    const childId = `${ctx.coroutineId}.${ctx.childCounter++}`;
    return {
      *[Symbol.iterator]() {
        return yield* runDurableChild(workflow, childId, ctx);
      },
    };
  });

  return yield* effectionRace(childOps);
}
```

Uses Effection's native `race()`, which spawns all children and returns
the first to complete, cancelling the rest. During replay, the winner
short-circuits from its stored Close(ok), the losers short-circuit into
suspend() from their stored Close(cancelled), and Effection's race cancels
the suspended losers — identical to the original run.

### 8.6 Close event ordering

Causal ordering is enforced naturally by the control flow:

1. Child completes → `runDurableChild` appends Close in finally
2. Child Close is awaited via `yield* call()`
3. Parent resumes only after the child's generator finishes (Effection's
   scope lifetime guarantee)
4. Parent's subsequent Yield events are appended after all child Closes

For `durableAll`: all child Closes precede the parent's post-join effects.
For `durableRace`: winner's Close precedes losers' Close(cancelled), all
precede the parent's next effect.

---

## 9. Replay index (validated)

Implemented in `replay-index.ts` with 21 unit tests (DEC-013).
Follows the spec §4.1 exactly with no extensions beyond `getCursor()`
and `yieldCount()` diagnostic accessors.

### 9.1 Structure

Built from the stream on startup. Provides per-coroutine cursored access:

```typescript
class ReplayIndex {
  private yields = new Map<CoroutineId, Array<{
    description: EffectDescription;
    result: Result;
  }>>();
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

  peekYield(id: CoroutineId) {
    const list = this.yields.get(id);
    const cursor = this.cursors.get(id) ?? 0;
    return list?.[cursor];
  }

  consumeYield(id: CoroutineId) {
    const cursor = this.cursors.get(id) ?? 0;
    this.cursors.set(id, cursor + 1);
  }

  getCursor(id: CoroutineId): number {
    return this.cursors.get(id) ?? 0;
  }

  hasClose(id: CoroutineId): boolean {
    return this.closes.has(id);
  }

  getClose(id: CoroutineId): Close | undefined {
    return this.closes.get(id);
  }

  isFullyReplayed(id: CoroutineId): boolean {
    return this.peekYield(id) === undefined && this.hasClose(id);
  }

  yieldCount(id: CoroutineId): number {
    return this.yields.get(id)?.length ?? 0;
  }
}
```

### 9.2 Stored as Effection Context

The replay index is part of `DurableContext`, set on the root scope when
a durable execution begins. All child scopes inherit it (Effection contexts
use prototypal inheritance). Each child scope has its own `coroutineId` and
`childCounter` but shares the same `replayIndex` and `stream`.

---

## 10. Entry point: durableRun (validated)

Implemented in `run.ts`. Key implementation details beyond the
original design: short-circuits on existing Close event (DEC-016),
checks for early-return divergence after workflow completes, and
emits Close(err) on exceptions.

The entry point creates a scope, builds the replay index, sets up the
durable context, and runs the workflow:

```typescript
interface DurableRunOptions {
  stream: DurableStream;
  coroutineId?: string;
}

async function durableRun<T extends Json | void>(
  workflow: () => Workflow<T> | Operation<T>,
  options: DurableRunOptions,
): Promise<T> {
  const { stream, coroutineId = "root" } = options;
  const events = await stream.readAll();
  const replayIndex = new ReplayIndex(events);

  // Short-circuit: root already completed in a previous run
  if (replayIndex.hasClose(coroutineId)) {
    const closeEvent = replayIndex.getClose(coroutineId)!;
    if (closeEvent.result.status === "ok") return closeEvent.result.value as T;
    if (closeEvent.result.status === "err") throw deserializeError(closeEvent.result.error);
    throw new Error("Workflow was cancelled");
  }

  const [scope, destroy] = createScope();
  scope.set(DurableCtx, { replayIndex, stream, coroutineId, childCounter: 0 });

  try {
    // Workflow<T> is structurally assignable to Operation<T> — no cast needed
    const task = scope.run(workflow);
    const result = await task;

    // §6.3: Check for early return divergence
    const cursor = replayIndex.getCursor(coroutineId);
    const totalYields = replayIndex.yieldCount(coroutineId);
    if (cursor < totalYields) {
      throw new EarlyReturnDivergenceError(coroutineId, cursor, totalYields);
    }

    await stream.append({
      type: "close", coroutineId,
      result: { status: "ok", value: result as Json },
    });
    return result;
  } catch (error) {
    await stream.append({
      type: "close", coroutineId,
      result: { status: "err", error: serializeError(error) },
    });
    throw error;
  } finally {
    try { await destroy(); } catch { /* swallow scope cleanup errors */ }
  }
}
```

Key details:

- **Short-circuit on existing Close.** If the journal already has a Close
  for the root coroutine, the workflow completed in a previous run. Return
  the stored result directly without creating a scope or running the
  workflow. This is why full-replay tests show zero effect executions and
  zero appends.

- **`Workflow<T> | Operation<T>` union.** Accepts either type. Combinators
  now return `Workflow<T>` (they self-wrap with `ephemeral()`), so the
  `Operation<T>` arm is primarily for backward compatibility and edge cases
  where users pass a raw Operation at the top level. Structural compatibility
  means no cast is needed at the `scope.run()` call site.

- **Early return divergence check.** After the workflow returns, checks
  if the replay index has unconsumed yields. If so, the generator finished
  before replaying all journal entries — the code has changed (§6.3).

- **Swallowing destroy errors.** If the workflow threw, `destroy()` may
  also throw "halted". The `try { await destroy() } catch {}` in finally
  prevents masking the original error.

---

## 11. What can and cannot be used in workflows (validated)

### 11.1 Three categories of durable operations

**Leaf effects** return `Workflow<T>` — they yield a single `DurableEffect`
and are the atomic units of durable execution:

| Leaf effect | Equivalent Effection operation |
|-------------|-------------------------------|
| `durableSleep(ms)` | `sleep(ms)` |
| `durableCall(name, fn)` | `call(fn)` |
| `durableAction(name, executor)` | `action(executor)` |
| `versionCheck(name, opts)` | (new, no equivalent) |

**Combinators** return `Workflow<T>` — they self-wrap their infrastructure
effects (`useScope`, `spawn`) in `ephemeral()` and delegate to Effection's
native structured concurrency primitives. Child signatures are tightened to
`() => Workflow<T>`; bare Operations are rejected at compile time.

| Combinator | Equivalent Effection operation |
|------------|-------------------------------|
| `durableSpawn(workflow)` | `spawn(operation)` |
| `durableAll([...workflows])` | `all([...operations])` |
| `durableRace([...workflows])` | `race([...operations])` |

Because combinators return `Workflow<T>`, top-level workflows that use them
can also be typed as `Workflow<T>`. The infrastructure effects wrapped in
`ephemeral()` produce no Yield events — only the child workflows'
`DurableEffect` values appear in the journal.

**Escape hatch** — `ephemeral<T>(operation: Operation<T>): Workflow<T>` wraps
a non-durable Operation so it can be used inside a Workflow. It is transparent
to the journal (no Yield event, no replay index entry) and re-runs on replay.
This is analogous to Rust's `unsafe {}` — every non-durable Operation that
participates in a Workflow must go through `ephemeral()`, making the escape
explicit and auditable. Users rarely need this directly since combinators
self-wrap internally, but it is available for custom infrastructure
Operations. See DEC-034.

| Escape hatch | Purpose |
|-------------|---------|
| `ephemeral(operation)` | Wrap non-durable Operation for use in Workflow |

### 11.2 Rejected (type error)

| Operation | Why it's rejected |
|-----------|-------------------|
| `useAbortSignal()` | Returns a scope-bound resource that doesn't survive replay |
| `each(stream)` | Streams are stateful subscriptions, not serializable |
| `resource(fn)` | Resources hold live state (connections, handles) |
| `on(target, name)` | EventTarget-based, not serializable |
| `sleep(ms)` | Effection's `sleep` — use `durableSleep` instead |
| `call(fn)` | Effection's `call` — use `durableCall` instead |

### 11.3 The boundary is intentional

This is the "freeing" quality Charles described. You don't have to think about
whether something is safe for durable execution — the compiler tells you. The
set of workflow-enabled effects is small and explicit. Each one has a clear
contract: it carries a structured description, it handles its own replay, and
its result is JSON-serializable.

If you intentionally need a non-durable Operation inside a Workflow, `ephemeral()`
makes the boundary visible — every `ephemeral()` call is an auditable point
where durable guarantees are relaxed. This is the same principle as Rust's
`unsafe {}`: the type system enforces safety by default, and the escape hatch
is explicit.

---

## 12. Design questions — status

Most questions from the initial analysis have been resolved through
implementation. Decisions are recorded in `DECISIONS.md` (29 entries).
Key validations:

| Question | Status | Decision |
|----------|--------|----------|
| Workflow type constraint | ✅ Resolved | `Generator<DurableEffect<unknown>, T, unknown>` (DEC-009) |
| DurableEffect ↔ Effect compatibility | ✅ Resolved | Structural match, no casts needed (DEC-010, DEC-015) |
| routine.scope accessibility | ✅ Resolved | Confirmed in Effection 4.1 alpha source (DEC-012) |
| Replay/live dispatch location | ✅ Resolved | Inside `enter()`, no reducer changes (DEC-014) |
| Persist-before-resume strategy | ✅ Resolved | Strategy B — async append + deferred resolve (DEC-017) |
| Serialization boundary | ✅ Resolved | `T extends Json` type constraint (DEC-018) |
| DurableStream interface | ✅ Resolved | `readAll()` + `append()`, InMemoryStream for tests, HttpDurableStream for production |
| Terminal divergence detection | ✅ Resolved | Both cases implemented with 3 error classes (DEC-008) |
| durableSpawn implementation | ✅ Resolved | Operations using Effection's native spawn/all/race |
| HTTP backend adapter | ✅ Resolved | Raw fetch writes, promise chain serialization, epoch fencing (DEC-026–029) |
| Batch persistence | ⏳ Deferred | Optimization for concurrent children, not blocking correctness. See §15.1 |
| Durable `each()` | ✅ Resolved | Operation-native `DurableSource`, module-level state, `ephemeral()` wrapping (DEC-030) |
| `ephemeral()` escape hatch | ✅ Resolved | Explicit adapter for non-durable Operations in Workflows (DEC-034) |
| Continue-As-New | ⏳ Future | Journal compaction for long-running loops. Tightly coupled with durableEach. See §15.2 |

### 12.1 Structured concurrency combinators (resolved)

The combinators are **`Workflow` generators that self-wrap with `ephemeral()`,
not `DurableEffect`s.** This is a significant departure from the earlier
design sketches. The key insight: combinators don't need to be durable effects
because spawns are not journaled. They're pure scope plumbing that delegates
to Effection's native structured concurrency primitives. The `ephemeral()`
wrapper makes them return `Workflow<T>` so they compose seamlessly with other
durable operations.

```typescript
// durableSpawn, durableAll, durableRace all return Workflow<T>
function* durableSpawn<T extends Json | void>(op): Workflow<Task<T>> { ... }
function* durableAll<T extends Json | void>(ops): Workflow<T[]> { ... }
function* durableRace<T extends Json | void>(ops): Workflow<T> { ... }
```

**How combinators interact with the type system.** A `Workflow<T>` is
`Generator<DurableEffect<unknown>, T, unknown>` — it constrains what the
generator *yields*. Combinators use infrastructure effects (`useScope()`,
`spawn()`) internally, but wrap them in `ephemeral()` which produces a
`DurableEffect` (transparent to the journal). This means `yield* durableAll(...)`
inside a generator annotated as `Workflow<T>` works — the combinators satisfy
the yield constraint.

Top-level workflows that use combinators can be typed as `Workflow<T>`:

```typescript
// This is typed as Workflow<string> — combinators return Workflow<T>
function* myWorkflow(): Workflow<string> {
  const prefix = yield* durableCall("step1", () => fetchPrefix());
  const results = yield* durableAll([
    function* () { return yield* durableCall("a", () => fetchA()); },
    function* () { return yield* durableCall("b", () => fetchB()); },
  ]);
  return `${prefix}-${results.join(",")}`;
}
```

**Child signatures tightened to `() => Workflow<T>`.** Combinators no longer
accept `Operation<T>` children. This is the primary safety boundary — users
cannot accidentally pass bare Operations whose effects wouldn't be journaled.
To intentionally use a non-durable Operation as a child, wrap it in
`ephemeral()`:

```typescript
yield* durableAll([
  function* () { return yield* durableCall("a", () => fetchA()); },
  function* () {
    // Explicit escape hatch — this Operation won't be journaled
    return yield* ephemeral(someInfrastructureOperation());
  },
]);
```

**Why not the DurableEffect-in-enter() approach.** The earlier sketch had
durableSpawn as a raw `DurableEffect` calling `scope.spawn()` inside
`enter()`. This had problems: (1) `CoroutineView` didn't expose `spawn()`,
(2) mixing imperative scope calls inside `enter()` is fighting Effection's
design rather than working with it, (3) it couldn't use `all()` or `race()`
which are generator-based. Using Effection's native combinators gets error
isolation (`trap()`), cancellation propagation, and scope lifetime
management for free.

**The `runDurableChild` helper.** All three combinators share a single
helper that wraps child workflows with DurableContext and Close event
handling. See §8.1 for the full implementation. This is the single point
of responsibility for child lifecycle — DurableContext setup, Close event
short-circuiting, the suspend() trick for cancelled replay, and the
no-re-emission guard. Child signatures are `() => Workflow<T>` — matching
the combinator's public API.

### 12.2 Serialization boundary (resolved)

`durableCall<T extends Json>` constrains the return type at compile time
(DEC-018). Non-serializable values (Dates, BigInts, class instances) are
rejected by TypeScript. The constraint is intentionally strict — relaxing
later is easy, tightening would be breaking.

Error serialization is implemented in `serialize.ts` with
`serializeError()` / `deserializeError()`. Custom error properties beyond
`message`, `name`, and `stack` are lost — this matches the spec's
`SerializedError` shape.

Remaining design space: tagged encoding for Dates/BigInts could be added
as a future `DurableCodec` extension without changing the core protocol.

### 12.3 DurableStream interface (resolved) and HttpDurableStream backend

Implemented in `stream.ts` with the minimal interface:

```typescript
interface DurableStream {
  readAll(): Promise<DurableEvent[]>;
  append(event: DurableEvent): Promise<void>;
}
```

`InMemoryStream` implements this for testing, with hooks for tracking
append counts, injecting failures, and observing append ordering (used
by the persist-before-resume test).

`HttpDurableStream` (`http-stream.ts`) implements this for production
use, backed by HTTP calls to a Durable Streams server. Key design
decisions (DEC-026 through DEC-029):

- **Raw `fetch()` for writes, not IdempotentProducer** (DEC-026). The
  producer's fire-and-forget model is wrong for persist-before-resume.
  Raw fetch gives full control over the request/response cycle and
  captures `Stream-Next-Offset` from every response.
- **Promise chain serialization for concurrent appends** (DEC-027).
  Sequence numbers assigned synchronously, HTTP calls chained behind
  `this.pending` to prevent out-of-order arrival.
- **Close events in finally are best-effort** (DEC-028). Missing Close
  events mean re-execution on replay, which is idempotent.
- **`lastOffset` tracked from every response** (DEC-029). This is the
  resumption point for future `tail()` calls. Not consumed yet but
  available for the tailing feature.

All unexpected HTTP statuses (including transient 500/503) are treated
as fatal, setting `this.fatalError` so future appends fail-fast. This is
the safe choice when the sequence state is uncertain — a failed append
may or may not have persisted, so continuing with the next seq number
risks a 409 gap. A future version could add retry-with-same-seq logic
for transient errors, but that requires careful handling of the ambiguity
window.

Tests: `smoke.test.ts` — 11 tests against a real
`DurableStreamTestServer`, covering round-trip, empty reads, idempotent
dedup, epoch fencing, full `durableRun`, replay, concurrent appends via
`durableAll`, network errors, offset tracking, fail-fast, and error
preservation.

#### Verified: `readAll()` response shape ✓

`HttpDurableStream.readAll()` uses `stream()` from
`@durable-streams/client@0.2.1`. Both assumptions have been verified
by inspecting the client library source:

1. **Wire format — confirmed.** `stream()` returns a `StreamResponseImpl`.
   `res.json()` returns a proper JSON array (`Content-Type: application/json`),
   not NDJSON. `res.json()` → `DurableEvent[]` works correctly.

2. **Client library API shape — confirmed.** `res.offset` is a prototype
   getter on `StreamResponseImpl` that returns the value of the
   `Stream-Next-Offset` response header. No need for manual header access.

Both assumptions hold. The current `readAll()` implementation is correct.
Documented in `http-stream.ts`.

#### Future interface evolution

The `DurableStream` interface is deliberately minimal. Future features
add methods without changing existing ones:

```typescript
interface DurableStream {
  readAll(): Promise<DurableEvent[]>;           // catch-up (exists)
  append(event: DurableEvent): Promise<void>;   // write (exists)
  tail(offset: string): AsyncIterable<DurableEvent>;  // future: SSE/long-poll
  readFrom(offset: string): Promise<DurableEvent[]>;  // future: cursor-based
}
```

`readAll()` stays unchanged — it's the startup catch-up for building the
ReplayIndex. `tail()` watches for live events after catch-up (needed for
external workflow observers and multi-worker coordination). `readFrom()`
is cursor-based partial reads (needed for `durableEach` checkpoint
resumption). Both are additive — writes are always HTTP POST regardless
of how you read. The `lastOffset` field already tracked on
`HttpDurableStream` is the resumption point for both.

The Durable Streams protocol explicitly supports this transition: "catch
up then tail" is a first-class pattern where you read from offset `-1`,
get `Stream-Up-To-Date: true`, then switch to `?live=sse` or
`?live=long-poll` at your last offset.

### 12.4 Batch persistence (Strategy C)

During `all()` with multiple children, several effects may resolve in the
same reducer tick (especially during replay-to-live transition). The spec's
Strategy C suggests batching writes. This could be implemented by having
`DurableEffect.enter()` enqueue writes to a buffer on the `DurableContext`,
with the buffer flushed at the end of each reduce cycle.

### 12.5 Terminal divergence detection (resolved)

Both cases from §6.3 are implemented and tested (DEC-008):

1. **Generator finishes early.** Detected in `durableRun()` after the
   workflow returns — if `cursor < totalYields`, throws
   `EarlyReturnDivergenceError`. Tested in divergence test 9 and 13.

2. **Generator continues past close.** Detected in
   `createDurableEffect.enter()` — when `peekYield()` returns undefined
   but `hasClose()` returns true, throws
   `ContinuePastCloseDivergenceError`. Tested in divergence test 14.

Three distinct error classes share `name = "DivergenceError"` for
catch-all handling but carry different diagnostic fields for precise
`instanceof` checks.

### 12.6 Durable `each()` — design and implementation plan

Charles's example showed the powerful implication: in a durable workflow,
each iteration of a loop can run on a different VM. This requires a durable
iteration primitive that checkpoints its position after each item.

#### The `for...of` constraint

JavaScript's `for...of` calls `iterator.next()` synchronously. Inside a
generator, there is no opportunity to yield a DurableEffect between the
`for...of` calling `next()` and the loop body receiving the value. This
means the naive design — where each `next()` call is itself a DurableEffect
— cannot use `for...of`.

The solution is the **pre-fetch pattern**: fetch the next item *before*
the `for...of` iterator is re-entered. The synchronous `next()` just
returns an already-fetched value.

#### User-facing API

Consistent with Effection's `each()` / `each.next()` pattern:

```typescript
function* processQueue(): Workflow<void> {
  for (let msg of yield* durableEach("queue", source)) {
    yield* durableCall("process", () => process(msg));
    yield* durableEach.next();  // checkpoint + pre-fetch next item
    // crash here → resume picks up at next message
  }
}
```

How the cycle works:

1. `yield* durableEach("queue", source)` — yields a DurableEffect that
   fetches item 1 from the source (or replays it from the journal).
   Stores state in an Effection context. Returns a synchronous iterable.

2. `for (let msg of yield* ...)` — calls the iterable's `next()`
   synchronously. The iterator is a generator: `while (state.current
   !== done) { yield state.current; }`. It yields the pre-fetched
   item 1.

3. Loop body runs — `yield* durableCall(...)` journals the processing.

4. `yield* durableEach.next()` — reads state from Effection context,
   yields a DurableEffect that fetches item 2 from the source (or
   replays from journal). Updates `state.current`. Sets
   `state.advanced = true`.

5. Back to `for...of` — calls the iterator's synchronous `next()`,
   re-enters the while loop, sees `state.current` is item 2, yields it.

6. When the source is exhausted, `yield* durableEach.next()` sets
   `state.current` to the done sentinel. The while loop exits,
   `for...of` sees `{ done: true }`, loop ends.

#### Advance guard

Without `yield* durableEach.next()`, the `for...of` spins forever on
the same item — `state.current` never advances. This is the most obvious
footgun in the API, so `durableEach` detects it at runtime using an
`advanced` flag on the shared state (see the implementation sketch
below for the full code).

The flag cycle: iterator yields → sets `advanced = false` → loop body
→ `yield* durableEach.next()` sets `advanced = true` + fetches →
iterator re-enters while → checks `advanced` → yields next item. If the
iterator is re-entered with `advanced` still false, it throws
immediately with a message telling the developer exactly what to do.

Edge cases:

- **`break` or `return` inside the loop.** The iterator isn't
  re-entered, so the check never fires. Legitimate early exit works.
- **`continue` without `durableEach.next()`.** The iterator re-enters,
  sees `advanced` is false, throws. This is correct — skipping without
  checkpointing means a crash would re-deliver the skipped item,
  violating the "resume at next unconsumed item" contract. To skip
  an item, call `yield* durableEach.next()` before `continue`.

#### Types

```typescript
/** Source of items for durable iteration (Operation-native). */
interface DurableSource<T extends Json> {
  /** Read the next item, blocking until available. */
  next(): Operation<{ value: T } | { done: true }>;
  /** Teardown — called on cancellation or completion. Must be idempotent. */
  close?(): void;
}

/** State shared between durableEach and durableEach.next(). */
interface DurableEachState<T extends Json> {
  name: string;
  source: DurableSource<T>;
  current: T | typeof DONE;
  advanced: boolean;
}
```

Note: `DurableSource.next()` returns `{ value: T } | { done: true }`
rather than `T | null` because `null` is valid JSON — a source that
legitimately produces null items would signal false exhaustion with a
null sentinel.

The optional `close()` method handles teardown on cancellation. Without
it, if the workflow is cancelled while `source.next()` is awaiting
(long-poll on a queue, database cursor), the pending read holds a
connection open indefinitely. The `createDurableEffect` teardown
function should call `source.close?.()`.

#### Journal shape

Each `yield* durableEach.next()` and the initial fetch in `yield* durableEach()`
produce identical Yield events:

```
[0] yield root  { type: "each", name: "queue" }  result: { status: "ok", value: { value: msg1 } }
[1] yield root  { type: "call", name: "process" } result: { status: "ok" }
[2] yield root  { type: "each", name: "queue" }  result: { status: "ok", value: { value: msg2 } }
[3] yield root  { type: "call", name: "process" } result: { status: "ok" }
[4] yield root  { type: "each", name: "queue" }  result: { status: "ok", value: { done: true } }
[5] close root  result: { status: "ok" }
```

The `{ value: T } | { done: true }` wrapper is stored directly in
the result's value field. Position-based divergence detection handles
repeated identical descriptions (`{ type: "each", name: "queue" }`)
correctly — matching is by cursor position, not description uniqueness.

On replay, stored items are fed back from the journal without
re-reading from the source. The source's `next()` is never called
during replay.

#### Implementation sketch

```typescript
// Sentinel for source exhaustion (not exported)
const DONE = Symbol("durableEach.done");
type ItemOrDone<T> = T | typeof DONE;

// Module-level state for sharing between durableEach and durableEach.next().
// Safe because durable execution is single-threaded.
let activeState: DurableEachState<Json> | null = null;

function durableEachFetch<T extends Json>(
  name: string,
  source: DurableSource<T>,
): Workflow<ItemOrDone<T>> {
  return (function* () {
    const result = (yield createDurableOperation<{ value: T } | { done: true }>(
      { type: "each", name },
      () => source.next(),
    )) as { value: T } | { done: true };

    if ("done" in result) return DONE;
    return result.value;
  })();
}

// Internal: returns Operation<Iterable<T>> because ensure() is infrastructure
function* _durableEachOp<T extends Json>(
  name: string,
  source: DurableSource<T>,
): Operation<Iterable<T>> {
  yield* ensure(() => { source.close?.(); });

  const first: ItemOrDone<T> = yield* durableEachFetch(name, source);

  // Store state in module-level slot for durableEach.next() to access
  const state: DurableEachState<T> = {
    name,
    source,
    current: first,
    advanced: true,
  };
  activeState = state as DurableEachState<Json>;

  return {
    *[Symbol.iterator]() {
      try {
        while (!isDone(state.current)) {
          if (!state.advanced) {
            throw new Error(
              `durableEach("${name}"): yield* durableEach.next() must be ` +
              `called before the next iteration.`
            );
          }
          state.advanced = false;
          yield state.current as T;
        }
      } finally {
        activeState = null;
        source.close?.();
      }
    },
  };
}

// Public API: wraps in ephemeral() to return Workflow<Iterable<T>>
function* _durableEach<T extends Json>(
  name: string,
  source: DurableSource<T>,
): Workflow<Iterable<T>> {
  return yield* ephemeral(_durableEachOp(name, source));
}

// Static method — pure Workflow, no infrastructure effects
durableEach.next = function* <T extends Json>(): Workflow<void> {
  if (activeState === null) {
    throw new Error("durableEach.next(): no active durableEach iteration.");
  }
  const state = activeState as DurableEachState<T>;
  state.current = yield* durableEachFetch<T>(state.name, state.source);
  state.advanced = true;
};
```

Key design choices:

- **Module-level state sharing.** State is stored in a module-level
  `activeState` variable (not Effection context). This is safe because
  durable execution is single-threaded — only one coroutine runs at a
  time. This avoids the scope isolation problem that arises when both
  `durableEach()` and `durableEach.next()` are individually wrapped in
  `ephemeral()`: each `ephemeral()` call creates an isolated child scope
  via `scope.run()`, making Effection context set in one child invisible
  to the other.

- **`durableEach` wraps in `ephemeral()`; `durableEach.next()` does not.**
  `durableEach` uses `ensure()` (an infrastructure Operation), so it
  needs `ephemeral()` to satisfy the `Workflow<T>` return type.
  `durableEach.next()` only reads module-level state and calls
  `durableEachFetch` (a pure `Workflow`), so it is itself a pure `Workflow`
  with no `ephemeral()` needed.

- **Both return `Workflow<T>`.** Unlike the previous design where both
  returned `Operation<T>`, the current implementation returns `Workflow<T>`
  — `durableEach` via `ephemeral()` wrapping, `durableEach.next()` natively.
  This means they compose cleanly inside `Workflow`-annotated generators.

- **Operation-native `DurableSource.next()`.** The source interface uses
  `next(): Operation<...>` instead of `next(): Promise<...>`. This enables
  full structured concurrency — cancellation of the scope cancels the
  in-flight `source.next()` call via Effection's normal teardown.

- **Symbol sentinel for exhaustion.** `DONE` is a private Symbol,
  not `null` or `undefined`. Cannot collide with any JSON value from
  the source.

- **Source teardown in effect teardown.** The `createDurableEffect`
  teardown function calls `source.close?.()`, so cancellation during
  a pending `source.next()` can clean up (abort fetch, close cursor,
  release connection).

- **durableEachFetch is the only DurableEffect.** Both the initial
  fetch (inside `durableEach`) and subsequent fetches (inside
  `durableEach.next()`) go through the same helper. Same effect
  description, same journal format, same replay path.

#### Three approaches to checkpointing (background)

The implementation above uses **Option A: yield-per-item**. Two
alternative approaches exist for future consideration:

**Option B: Cursor checkpoint.** Instead of recording each item,
record a cursor/offset that represents "I've processed up to here."
On replay, the runtime reads from the cursor position, not from the
start. Requires the source to support cursor-based reads — which maps
to the Durable Streams `readFrom(offset)` pattern or any external
system with offset semantics (Kafka consumer offsets, database
sequences, SQS receipt handles). Smaller journals, faster replay.
But the source must be re-readable from a position, which not all
sources support (transient webhook streams, one-shot HTTP responses).

**Option C: Hybrid with Continue-As-New.** Record items in the
journal (like A), but periodically compact by starting a new execution
with a fresh journal. After N iterations, `durableRun` returns a
continuation token (cursor position + accumulated state), and the
scheduler starts a new execution seeded with that token. Works with
any source. Bounds journal growth. But requires Continue-As-New as
a separate feature (see §15.2).

Option A is the right starting point: no new `DurableStream` methods
needed, no new features required. The unbounded journal limitation is
acceptable for initial use cases with bounded iteration counts (process
a batch of N items, not an infinite stream). Add `readFrom(offset)` and
Continue-As-New as follow-on work when journal size becomes a practical
constraint.

#### Interaction with durableAll

When durableEach feeds items into parallel processing pipelines:

```typescript
function* fanOut(): Workflow<void> {
  const batch: Json[] = [];
  for (let msg of yield* durableEach("queue", source)) {
    batch.push(msg);
    if (batch.length === 10) {
      yield* durableAll(batch.map(m =>
        function*() { yield* durableCall("process", () => process(m)); }
      ));
      batch.length = 0;
    }
    yield* durableEach.next();
  }
}
```

This produces bursts of concurrent appends (10 children resolving in
the same tick), making batch persistence (Strategy C, §15.1) a
performance concern. Without it, each child's Yield event is a separate
HTTP POST awaited sequentially via the promise chain.

#### Interaction with Effection's `each()`

Effection's `each(subscription)` consumes streams within structured
concurrency using a channel-based protocol. `durableEach` mirrors the
same API pattern — `each()` returns an iterable, `each.next()` is a
static method that advances via context — but cannot wrap `each()`
directly because `each()` yields infrastructure effects
(`Effect<unknown>`, not `DurableEffect<unknown>`). The type constraint
rejects it.

`durableEach` re-implements the pre-fetch pattern using `useScope()`
and Effection contexts, matching `each()`'s ergonomics while staying
within the durable type system. The two serve different purposes:
Effection's `each()` is for reactive stream consumption within a scope;
`durableEach` is for durable checkpoint-based consumption that survives
crashes.

---

## 13. Summary of what doesn't change

| Component | Changes? | Notes |
|-----------|----------|-------|
| `Reducer` | No | Unchanged. Calls `enter()` on effects as always. |
| `Effect<T>` | No | Unchanged. `DurableEffect` extends it. |
| `Operation<T>` | No | Unchanged. `Workflow` is a subtype. |
| `Scope` / `ScopeInternal` | No | Unchanged. Durable context stored via existing Context system. |
| `Context` | No | Unchanged. Used to store `DurableContext`. |
| `Api.around()` | No | Unchanged. Not used — Close events handled via try/finally in `runDurableChild`. |
| `PriorityQueue` | No | Unchanged. Deterministic ordering enables replay. |
| `createTask()` | No | Unchanged. Durable variant wraps it with context setup. |
| `spawn()`, `all()`, `race()` | No | Unchanged. Durable combinators delegate to them directly. |

---

## 14. Progress and next steps

### Completed (Tier 1-4 + HTTP backend)

1. ~~Validate type system~~ — `Workflow<T>` rejects `Operation` usage at
   compile time (DEC-009, `types.test.ts`).
2. ~~Implement `createDurableEffect`~~ — Replay/live dispatch in `enter()`
   (`effect.ts`).
3. ~~Implement `ReplayIndex`~~ — Spec-compliant, 21 tests
   (`replay-index.ts`, `replay-index.test.ts`).
4. ~~Implement workflow effects~~ — `durableSleep`, `durableCall`,
   `durableAction`, `versionCheck` (`operations.ts`).
5. ~~Implement `durableRun`~~ — Entry point with in-memory stream
   (`run.ts`).
6. ~~Run Tier 1 tests~~ — Golden run, full replay, crash-at-N,
   persist-before-resume, actor handoff — all passing
   (`durable-run.test.ts`).
7. ~~Run Tier 2 tests~~ — All divergence detection cases passing
   (`divergence.test.ts`).
8. ~~Implement `durableSpawn`, `durableAll`, `durableRace`~~ — Workflow
    generators that self-wrap infrastructure in `ephemeral()` and delegate
    to Effection's native spawn/all/race, with shared `runDurableChild`
    helper. Child signatures tightened to `() => Workflow<T>` (`combinators.ts`).
9. ~~Run Tier 3 tests~~ — Fork/join, nested scopes, race with
   cancellation, error propagation, partial replay — all passing
   (`structured-concurrency.test.ts`).
10. ~~Run Tier 4 tests~~ — Deterministic coroutine IDs across runs,
    live vs replay, nested hierarchical IDs, race IDs — all passing
    (`deterministic-id.test.ts`).
11. ~~Durable Streams backend adapter~~ — `HttpDurableStream`
    (`http-stream.ts`) with raw fetch writes, promise chain
    serialization, epoch fencing, offset tracking. 11 tests against
    real server (`smoke.test.ts`). DEC-026 through DEC-029.

### ~~Immediate: verify `readAll()` response shape~~ ✓ Complete

Verified in a prior session. `stream()` from `@durable-streams/client@0.2.1`
returns `StreamResponseImpl` where `res.json()` returns a JSON array and
`res.offset` is a prototype getter for the `Stream-Next-Offset` header.
Both assumptions confirmed correct. See §12.3 for details.

12. ~~Implement `durableEach`~~ — Durable iteration primitive with
    Operation-native `DurableSource`, module-level state sharing,
    `ephemeral()` wrapping. 10 tests passing (`each.ts`,
    `durable-each.test.ts`). DEC-030.
13. ~~Implement `ephemeral()`~~ — Explicit escape hatch for non-durable
    Operations inside Workflows. Transparent to the journal. 6 tests
    passing (`ephemeral.ts`, `ephemeral.test.ts`). DEC-034.

### Future improvements

15. **Batch persistence (Strategy C).** Optimize concurrent child effects
    by batching writes within a single reduce cycle. Becomes a performance
    concern when `durableEach` feeds items into `durableAll` parallel
    processing. See §12.4 and §15.1.

16. **Continue-As-New.** Periodic journal compaction for long-running
    `durableEach` loops. Bounds journal growth. See §15.2.

17. **SSE/long-poll tailing.** `tail(offset)` method on `DurableStream`
    for watching live events — needed for external workflow observers
    and multi-worker coordination. See §12.3 on future interface
    evolution. Additive, no changes to existing methods.

---

## 15. Future architecture considerations

### 15.1 Batch persistence (Strategy C)

During `all()` with multiple children, several effects may resolve in the
same reducer tick (especially during replay-to-live transition). The spec's
Strategy C suggests batching writes — accumulating Yield events into a
buffer on the `DurableContext` and flushing at the end of each reduce cycle.

The current implementation uses Strategy B (async append + deferred resolve)
on every individual effect. For the HTTP backend, this means each child's
Yield event is a separate HTTP POST, serialized by the promise chain
(DEC-027). With N concurrent children, that's N sequential round-trips.

Strategy C would batch these into a single HTTP POST using the Durable
Streams `lingerMs`-style batching (or a single POST with multiple JSON
messages). The batch is one sequence number — atomic at the batch level.
This amortizes latency but requires changes to `createDurableEffect`:
instead of calling `stream.append()` directly, it would enqueue to a buffer
and the buffer would flush after the synchronous reduce cycle completes.

The ordering constraint for batching: Close events must still be appended
strictly after the child's Yield events (causal ordering, spec §8). Within
a batch of sibling Yield events, ordering doesn't matter — they're from
independent coroutines.

Not blocking for correctness. Only relevant for throughput with concurrent
children.

### 15.2 Continue-As-New

For `durableEach` loops processing unbounded streams, the journal grows
without limit. Continue-As-New is the standard solution from Temporal and
similar systems: after N iterations (or N bytes of journal), the runtime
terminates the current execution and starts a new one seeded with a
continuation token — the current cursor position plus any accumulated state.

This requires:

- **durableRun recognizing a continuation signal.** The workflow returns
  a special value or throws a `ContinueAsNew` error that `durableRun`
  catches. Instead of writing `Close(ok)`, it writes a continuation
  marker and returns the seed state.
- **A scheduling layer.** Something outside `durableRun` that creates
  a new stream, seeds the new execution, and links the executions for
  observability. This might be a `DurableScheduler` or just a loop
  around `durableRun`.
- **Stream lifecycle management.** Old streams can be archived or deleted
  after the continuation starts. The Durable Streams protocol supports
  TTL-based retention but no compaction — Continue-As-New is the
  compaction strategy.

Continue-As-New is a significant feature. It touches `durableRun` (the
continuation signal), the stream interface (creating new streams), and
potentially a new scheduler layer. Design it alongside `durableEach`
since they're tightly coupled — `durableEach` without Continue-As-New
is limited to bounded iteration counts.

### 15.3 Uncancellable contexts for Close events

`runDurableChild` appends Close events in a `finally` block via
`yield* call(() => stream.append(...))`. During parent scope teardown,
this async operation can be interrupted by Effection's cancellation
(DEC-028). The protocol handles this gracefully — a missing Close just
means re-execution on replay — but it's a correctness gap for
observability (the journal may not reflect the child's actual terminal
state).

If Effection adds an uncancellable context in a future version (an
`uncancellable(() => ...)` wrapper that suppresses `iterator.return()`
during execution), `runDurableChild`'s finally block should use it.
This would guarantee Close events are always persisted, eliminating
the re-execution window.

### 15.4 Stream naming conventions

The HTTP adapter uses `${baseUrl}/${streamId}` as the URL. In a
multi-tenant or multi-workflow-type deployment, a naming convention
prevents collisions:

- `workflows/${workflowType}/${executionId}` — per-execution stream
  with type namespace
- `tenant/${tenantId}/workflows/${type}/${id}` — multi-tenant isolation

The Durable Streams protocol uses URL-path-based naming with no built-in
namespacing. Tenant isolation requires path-prefix scoping or separate
server instances. Worth deciding before production deployment but not
blocking for development.

### 15.5 Transient error retry for HTTP appends

The current `HttpDurableStream` treats all unexpected HTTP statuses
(including 500, 503) as fatal. This is the safe choice when the
sequence state is uncertain — a failed append may or may not have
persisted on the server.

A future version could add retry-with-same-seq logic for transient
errors:

1. On 500/503/timeout, retry the same `(Id, Epoch, Seq)` tuple.
2. If the server returns 200, the retry succeeded (first write).
3. If the server returns 204, the original append did persist
   (idempotent success).
4. Both outcomes are safe — the seq counter doesn't advance until
   the append is confirmed.

This requires distinguishing transient errors (retry-safe) from
permanent errors (StaleEpochError, SequenceGapError — fatal). The
current code's `fatalError` flag would need to become a discriminated
error state.
