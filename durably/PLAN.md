# @effectionx/durably — Implementation Plan

> **Status**: All phases complete. 99 tests passing, 0 failures.

## Goal

Extract the DurableReducer from the Effection fork
(`taras/effection`, branch `durable-internals`) into a standalone
`@effectionx/durably` package. This proves that durable
execution is **completely additive** to Effection — no fork required,
just a peer dependency on `effection` plus a community package.

---

## Prerequisites

### Effection PR 1127

**PR**: https://github.com/thefrontside/effection/pull/1127
**Branch**: `taras:feat/experimental-reducer-exports` → `v4-1-alpha`
**Preview build**: `https://pkg.pr.new/thefrontside/effection@1127`

This PR adds 15 lines to Effection (zero behavior changes, all 121
test steps pass). It exports the internal symbols needed by
DurableReducer through the existing `effection/experimental`
entrypoint:

| File | Change |
|------|--------|
| `experimental.ts` | Re-export `Reducer`, `ReducerContext`, `InstructionQueue`, `Instruction`, `DelimiterContext` |
| `lib/reducer.ts` | Add `export` to `Instruction` type and `InstructionQueue` class |
| `lib/callcc.ts` | Label: `withResolvers("await callcc")` |
| `lib/delimiter.ts` | Label: `withResolvers("await delimiter")` |
| `lib/each.ts` | Labels: `"await each done"`, `"await each context"` |
| `lib/future.ts` | Label: `withResolvers("await future")` |
| `lib/scope-internal.ts` | Label: `withResolvers("await destruction")` |

The `withResolvers` description labels are needed so that the
DurableReducer can distinguish infrastructure effects from user-facing
effects via the `isInfrastructureEffect()` method, which checks effect
description strings.

---

## Architecture

### How DurableReducer Works

Effection's architecture is built around a **Reducer** — a priority
queue that drives generators forward by calling `effect.enter()`,
waiting for resolution, and feeding results back via
`iterator.next(result)`. Every Effect in Effection flows through this
single point.

The **DurableReducer** replaces the built-in Reducer via
`ReducerContext` injection. It operates in two modes:

**Recording** (live execution):
- When a generator yields an Effect, writes `effect:yielded` to the
  stream
- When the Effect resolves, writes `effect:resolved`
- Scope lifecycle (`scope:created`, `scope:destroyed`, `scope:set`,
  `scope:delete`) captured via `Api.Scope` middleware
- Workflow completion writes `workflow:return`

**Replay** (resuming from a stream):
- Reads stored events from the stream
- When a generator yields an Effect, feeds the stored result directly
  via `iterator.next(storedResult)` without calling `effect.enter()`
- Transition from replay to live happens automatically when stored
  events are exhausted
- The generator doesn't know whether it's replaying or running live

### Infrastructure vs User-Facing Effects

Only user-facing effects are recorded. Infrastructure effects execute
live during both recording and replay:

**Recorded** (user-facing):
- `action()`, `sleep()`, `call()` — the coroutine's observable
  protocol
- `spawn()` — via the task result
- `resource()` — via the provided value
- `all()`, `race()`, `each()` — via their composed effects

**Live-only** (infrastructure):
- `useCoroutine()`, `useScope()` — internal plumbing
- `do <set(...)>`, `do <delete(...)>` — context mutations
- `await resource`, `await task`, `await delimiter`, `await future`,
  `await callcc`, `await destruction`, `await each done`,
  `await each context`, `await winner` — structural coordination

The DurableReducer identifies infrastructure effects by their
`description` string via `isInfrastructureEffect()`. This is why the
`withResolvers` labels in PR 1127 are necessary — without them, these
effects would be indistinguishable from user code.

### Scope-Aware Replay

Per-scope replay cursors handle concurrent interleaving correctly.
Effects from `each()`'s spawned child land in the child scope's
cursor, while `each.next()` effects land in the caller scope's cursor.

### Divergence Detection

If the workflow code changes between runs, the DurableReducer compares
the yielded effect's `description` string against the stored
`effect:yielded` event. A mismatch throws `DivergenceError`.

### Serialization Boundaries

Non-JSON-serializable values (Scope, Coroutine, Iterable) use a
`LiveOnlySentinel` placeholder. Infrastructure effects that produce
these values are identified by description and always execute live.

---

## Dependency Analysis

### What DurableReducer Imports from Effection

**From `effection` (public API):**
- `Err`, `Ok`, `Result` — from `lib/result.ts` via `lib/mod.ts`
- `Context`, `Coroutine`, `Effect`, `Operation`, `Scope` — from
  `lib/types.ts` via `lib/mod.ts`
- `createScope`, `global` — from `lib/scope.ts` via `lib/mod.ts`

**From `effection/experimental` (via PR 1127):**
- `ReducerContext` — context for injecting a custom reducer
- `InstructionQueue` — priority queue for processing instructions
- `Instruction` type — tuple type for reducer instructions
- `DelimiterContext` — context for accessing delimiter state (used in
  `emitWorkflowReturn()` to extract return values)
- `api` (specifically `api.Scope`) — for installing scope lifecycle
  middleware

### What `durably()` Needs

The `durably()` function (see `durably.ts`) needs:
- `createScope(global)` — creates a child scope from the global scope
- `scope.set(ReducerContext, reducer)` — injects the DurableReducer
- `reducer.installScopeMiddleware(scope)` — installs `Api.Scope`
  middleware for recording/replaying scope lifecycle events
- `scope.run(operation)` — runs the operation in the durable scope
- Eagerly-attached `.then()` handler for root scope settlement events

### Verified Public Exports

| Symbol | Source | Public? |
|--------|--------|---------|
| `global` | `lib/scope.ts` → `lib/mod.ts` | Yes |
| `createScope` | `lib/scope.ts` → `lib/mod.ts` | Yes |
| `Coroutine` | `lib/types.ts` → `lib/mod.ts` | Yes |
| `Effect` | `lib/types.ts` → `lib/mod.ts` | Yes |
| `Operation` | `lib/types.ts` → `lib/mod.ts` | Yes |
| `Task` | `lib/types.ts` → `lib/mod.ts` | Yes |
| `Scope` | `lib/types.ts` → `lib/mod.ts` | Yes |
| `Context` | `lib/context.ts` → `lib/mod.ts` | Yes |
| `Err`, `Ok`, `Result` | `lib/result.ts` → `lib/mod.ts` | Yes |
| `ReducerContext` | `lib/reducer.ts` → `experimental.ts` | Via PR 1127 |
| `InstructionQueue` | `lib/reducer.ts` → `experimental.ts` | Via PR 1127 |
| `Instruction` | `lib/reducer.ts` → `experimental.ts` | Via PR 1127 |
| `DelimiterContext` | `lib/delimiter.ts` → `experimental.ts` | Via PR 1127 |
| `api` | `lib/api.ts` → `experimental.ts` | Yes (existing) |

---

## Package Structure

```
durably/
├── PLAN.md                          # This file
├── README.md                        # Package documentation
├── mod.ts                           # Public API exports
├── durable-reducer.ts               # DurableReducer class (~765 lines)
├── durably.ts                       # durably() entry point (~113 lines)
├── types.ts                         # DurableEvent union, DurableStream interface, etc. (~163 lines)
├── stream.ts                        # InMemoryDurableStream (~58 lines)
├── durable-reducer.test.ts          # Core: recording, replay, resume, divergence, halt, spawn
├── durable-scope.test.ts            # Scope lifecycle, hierarchy, error, halt
├── durable-all-race.test.ts         # all(), race(), combined nesting
├── durable-resource.test.ts         # Resource, ensure, resource+spawn
├── durable-each.test.ts             # each() recording, replay, resume
├── durable-errors.test.ts           # Error handling, suspend, context, abort signal, etc.
├── package.json
└── tsconfig.json
```

### Source File Origins

| Package File | Fork Source | Adaptation Needed |
|--------------|-----------|-------------------|
| `types.ts` | `lib/durable/types.ts` | Rewrite TS parameter properties (Node strip-types compat) |
| `stream.ts` | `lib/durable/stream.ts` | Change import from `"./types.ts"` (same) |
| `durable-reducer.ts` | `lib/durable/durable-reducer.ts` | **Rewrite imports**: internal paths → `effection` + `effection/experimental`; rewrite TS parameter properties |
| `durably.ts` | `lib/run.ts` | **Extract** `durably()` function, same import adaptation |
| `mod.ts` | `lib/durable/mod.ts` | Add `durably` export, adjust paths |

### Import Adaptation for `durable-reducer.ts`

```typescript
// BEFORE (fork internal paths):
import { InstructionQueue, type Instruction } from "../reducer.ts";
import { Err, Ok, type Result } from "../result.ts";
import type { Context, Coroutine, Effect, Operation, Scope } from "../types.ts";
import { api as effection } from "../api.ts";
import { DelimiterContext } from "../delimiter.ts";

// AFTER (public + experimental):
import {
  InstructionQueue,
  type Instruction,
  DelimiterContext,
  api as effection,
} from "effection/experimental";
import { Err, Ok, type Result } from "effection";
import type { Context, Coroutine, Effect, Operation, Scope } from "effection";
```

### Import Adaptation for `durably.ts`

```typescript
// BEFORE (fork):
import type { Operation, Task } from "./types.ts";
import { createScope, global } from "./scope.ts";
import { ReducerContext } from "./reducer.ts";

// AFTER (package):
import type { Operation, Task } from "effection";
import { createScope, global } from "effection";
import { ReducerContext } from "effection/experimental";
```

---

## Package Configuration

### `package.json`

See `durably/package.json` for the actual file. Key points:
- Package name: `@effectionx/durably`
- Peer dependency on `effection ^4`
- Dev dependency on Effection PR 1127 preview build
- Dev dependency on `@effectionx/bdd` (workspace) and `expect`

### `tsconfig.json`

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["**/*.ts"],
  "exclude": ["**/*.test.ts", "dist"],
  "references": [{ "path": "../bdd" }]
}
```

### `mod.ts`

See `durably/mod.ts` for the actual file. Exports:
- `durably` — primary entry point function
- `DurablyOptions` — configuration type
- `DurableReducer`, `toJson` — reducer class and JSON utility
- `InMemoryDurableStream` — ephemeral stream implementation
- `DivergenceError`, `isLiveOnly`, `createLiveOnlySentinel` — utilities
- All event types (`DurableEvent`, `EffectYielded`, etc.) and `DurableStream` interface

---

## Workspace Integration

### Changes to monorepo root files

**`pnpm-workspace.yaml`** — add entry:
```yaml
  - "durably"
```

**`tsconfig.json`** — add reference:
```json
{ "path": "durably" }
```

**Root `package.json`** — no changes needed. The `effection` PR 1127
build is resolved at the package level, not the root level.

---

## Test Strategy

### Test Framework

Tests use `@effectionx/bdd` for `describe`/`it`/`beforeEach` and
`expect` from the npm `expect` package (jest's standalone matchers).
This follows the exact same pattern as every other effectionx package.

### Test Pattern

```typescript
import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { durably, InMemoryDurableStream, DivergenceError } from "./mod.ts";
import { sleep, action, spawn, suspend } from "effection";
import type { DurableEvent, Operation } from "effection";

describe("durably", () => {
  it("records effect events", function* () {
    let stream = new InMemoryDurableStream();
    yield* durably(function* () {
      yield* sleep(100);
      return "hello";
    }, { stream });
    let events = stream.read().map((e) => e.event);
    // ... assertions ...
  });
});
```

Key adaptation: `durably()` returns `Task<T>` which extends
`Future<T>` which extends `Operation<T>`. So `yield* durably(...)`
works directly inside the BDD test body (which is a generator
function).

Note: `durably()` creates its own scope tree via
`createScope(global)`, separate from the BDD test adapter's scope.
This is the same model as the fork's tests where `await run(...)`
creates a separate scope tree.

### Test File Mapping

| Fork Test File | Steps | Effectionx File |
|----------------|-------|-----------------|
| `durable.test.ts` | 25 | `durable-reducer.test.ts` |
| `durable-scope.test.ts` | 14 | `durable-scope.test.ts` |
| `durable-all-race.test.ts` | 15 | `durable-all-race.test.ts` |
| `durable-resource.test.ts` | 12 | `durable-resource.test.ts` |
| `durable-each.test.ts` | 11 | `durable-each.test.ts` |
| `durable-error-suspend-context.test.ts` | 22 | `durable-errors.test.ts` |
| `durable-abort-signal.test.ts` | 6 | `durable-errors.test.ts` |
| `durable-with-resolvers.test.ts` | 5 | `durable-errors.test.ts` |
| `durable-signal-channel.test.ts` | 6 | `durable-errors.test.ts` |
| `durable-interval.test.ts` | 2 | `durable-errors.test.ts` |
| **Total** | **118** | **6 files** |

### Test Porting Adaptations

For each test file, the following changes are needed:

1. **Imports**: Deno → Node.js
   ```typescript
   // FROM:
   import { describe, expect, it } from "./suite.ts";
   import { run } from "../mod.ts";
   import { InMemoryDurableStream } from "../lib/durable/stream.ts";
   import { DivergenceError } from "../lib/durable/types.ts";

   // TO:
   import { describe, it } from "@effectionx/bdd";
   import { expect } from "expect";
   import { durably, InMemoryDurableStream, DivergenceError } from "./mod.ts";
   ```

2. **Test bodies**: `async () =>` → `function* ()`
   ```typescript
   // FROM:
   it("records events", async () => {
     let stream = new InMemoryDurableStream();
     await run(function* () { ... }, { stream });
     expect(...);
   });

   // TO:
   it("records events", function* () {
     let stream = new InMemoryDurableStream();
     yield* durably(function* () { ... }, { stream });
     expect(...);
   });
   ```

3. **Error assertions**: `expect(fn).rejects.toThrow()` patterns need
   adaptation for generators. Use try/catch inside the generator body.

---

## Key Design Findings

These findings were discovered during the fork implementation and are
important context for the package:

### 1. Generator Delegation Runs During Replay

`yield* stream` (generator delegation) is NOT an Effection effect —
it's a language-level operation. The DurableReducer can only suppress
`effect.enter()` calls, not generator code between yield points. This
means during replay, generator code DOES execute — helper functions
run, variables are computed, delegation chains unwind — but no effects
actually enter.

### 2. Context Events Are Informational

`scope:set`/`scope:delete` events are recorded for observability but
NOT rehydrated during replay. Context operations re-execute live as
infrastructure effects (`do <set(...)>`).

### 3. The Reducer Is the Right Interception Point

The Reducer is the single place where `effect.enter()` is called. It
manages the instruction queue that enforces structured concurrency
ordering. Replaying through the instruction queue (not around it)
means all bookkeeping still runs.

### 4. Resource Lifecycle During Replay

Resources re-execute live (infrastructure), but their internal
`suspend` resolves from the stream during full replay, causing cleanup
to run before the main workflow continues. Live-only values (like
`AbortSignal`) may have different intermediate state during replay —
only final outcomes are deterministic.

### 5. Side-Effect Coupling Limitation

Primitives that rely on side effects inside `effect.enter()` callbacks
(signal.send, channel.send, setInterval) cannot fully replay from a
recorded stream. They work for **recording** and **mid-workflow
resume** but not full replay of workflows that interleave send/receive
across the replay frontier.

### 6. `each()` Scope Distribution

The `each()` primitive's internal structure creates a spawned child
scope for the subscription. Effects distribute across scopes:
- First `subscription.next()` runs in the spawned child scope
- Subsequent `each.next()` calls run in the caller scope
- The terminal `next()` returning `{ done: true }` does NOT yield an
  action effect

Per-scope replay cursors are essential to handle this correctly.

---

## Execution Checklist

- [x] Create `durably/` directory
- [x] Write `package.json`
- [x] Write `tsconfig.json`
- [x] Copy + adapt `types.ts` (rewrite TS parameter properties)
- [x] Copy + adapt `stream.ts` (minimal import change)
- [x] Copy + adapt `durable-reducer.ts` (rewrite imports + parameter properties)
- [x] Write `durably.ts` (extract from fork's `run.ts`)
- [x] Write `mod.ts` (public API barrel)
- [x] Add to `pnpm-workspace.yaml`
- [x] Add to root `tsconfig.json` references
- [x] Run `pnpm install`
- [x] Verify TypeScript builds clean
- [x] Port `durable-reducer.test.ts`
- [x] Port `durable-scope.test.ts`
- [x] Port `durable-all-race.test.ts`
- [x] Port `durable-resource.test.ts`
- [x] Port `durable-each.test.ts`
- [x] Port `durable-errors.test.ts` (consolidated)
- [x] Run all tests — **99 passing, 0 failures**
- [x] Write `README.md`
- [x] Update `PLAN.md` to reflect completed status
- [ ] Create PR

---

## Related Resources

- **Effection Fork**: https://github.com/taras/effection/tree/durable-internals
- **Effection PR 1126** (full fork PR): https://github.com/thefrontside/effection/pull/1126
- **Effection PR 1127** (exports only): https://github.com/thefrontside/effection/pull/1127
- **Design Specification**: `~/Repositories/cowboyd/coroutine-transport-protocol/docs/design-spec.md`
- **Consumer Project README**: `~/Repositories/cowboyd/coroutine-transport-protocol/README.md`
- **Durable Streams Protocol**: https://github.com/durable-streams/durable-streams
