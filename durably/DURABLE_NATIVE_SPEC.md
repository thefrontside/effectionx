# Spec: Introduce `@effectionx/durable` (Durable-Native API)

## Summary

Create a new package, `@effectionx/durable`, that provides durable-first
structured concurrency primitives (`spawn`, `all`, `race`, `resource`,
`scoped`, etc.) without compatibility prefixes.

This package is intentionally not API-compatible with plain Effection
`Operation` usage by default. It defines a durable-native type contract
(`DurableOperation`) and runtime invariants for replay correctness.

## Goals

- Provide durable-native imports like:
  - `import { spawn, all, race, resource, scoped } from "@effectionx/durable"`
- Make durability boundaries explicit and type-enforced.
- Preserve Effection structured concurrency semantics while adding durable
  replay guarantees.
- Reduce ambiguity around which operations are persisted/replayed.

## Non-Goals

- No backward-compatibility layer in this package.
- No prefix/wrapper API (`dSpawn`, `toDurable`) as primary surface.
- No full migration tooling in this PR.
- No deprecation/removal of `@effectionx/durably` in this initial rollout.

## Core Type Model

- Define `DurableOperation<T>` as a branded operation type used by all public
  APIs in `@effectionx/durable`.
- Keep brand private to prevent accidental structural assignment from plain
  Effection operations.
- Associate durable metadata internally (id/version/checkpoint/replay fields)
  for deterministic record/replay behavior.

### Relationship to Stream Identity

The `DurableOperation.id` is the **coroutine identity** within the stream.
Each workflow runs against a single Durable Stream, whose URL is the workflow
identity. Within that stream, `DurableOperation.id` identifies which logical
coroutine produced each event. The durable primitives (`spawn`, `durable`)
assign the `id` — user code does not provide it directly.

## Stream Protocol

### Design Decisions

These decisions were made during protocol design exploration (see
[coroutine-transport-protocol](https://github.com/cowboyd/coroutine-transport-protocol/blob/main/docs/protocol-redesign.md)):

1. **Single flat stream per workflow.** The stream URL is the workflow identity.
   The stream offset is the checkpoint. All concurrent coroutines write to one
   stream. This preserves transactionality — one stream, one offset, one
   checkpoint. Nested/separate streams were considered and rejected because
   Durable Streams has no atomic multi-stream operations, and the atomicity gap
   between creating a child stream and recording the reference in the parent is
   an unacceptable consistency risk.

2. **Correlation IDs for concurrency attribution.** Each event carries a
   `coroutineId` (from `DurableOperation.id`) and each `yield`/`next` pair
   shares an `effectId`. This is the proven pattern from `@effectionx/durably`
   (where `scopeId` + `effectId` serve the same role), renamed to match the
   coroutine protocol.

3. **Three-way terminal state for cancellation.** `close<Ok(value)>`,
   `close<Err(error)>`, `close<None>` (cancelled). Cancellation in Effection is
   intentional (parent stops child), not an error. A halted scope runs its
   cleanup successfully. Observers should see "cancelled" not "failed".
   Cross-language compatible since not all runtimes have exceptions.

4. **`next()` as separate stream entry.** Durable Streams are append-only and
   immutable by position. Pairing `next` with `yield` (updating in-place) is
   impossible. Each is an independent, immutable event. A `yield` without a
   following `next` naturally represents an interrupted coroutine.

### Event Schema

The stream carries 4 event types. This replaces the 8-type schema from
`@effectionx/durably` (`effect:yielded`, `effect:resolved`, `effect:errored`,
`scope:created`, `scope:destroyed`, `scope:set`, `scope:delete`,
`workflow:return`).

```typescript
type DurableEvent =
  | Yield
  | Next
  | Close
  | Spawn;

// Outbound: coroutine yielded an effect to the outside world
interface Yield {
  type: "yield";
  coroutineId: string;
  effectId: string;
  description: string;
}

// Inbound: outside world responded to a yield
interface Next {
  type: "next";
  coroutineId: string;
  effectId: string;
  status: "ok" | "err";
  value?: Json;          // present when status is "ok"
  error?: SerializedError; // present when status is "err"
}

// Terminal: coroutine reached a final state
interface Close {
  type: "close";
  coroutineId: string;
  status: "ok" | "err" | "cancelled";
  value?: Json;          // present when status is "ok"
  error?: SerializedError; // present when status is "err"
}

// Structural: coroutine spawned a child
interface Spawn {
  type: "spawn";
  coroutineId: string;     // parent
  childCoroutineId: string; // child
}
```

### What Changed from `@effectionx/durably`

| `@effectionx/durably` | `@effectionx/durable` | Notes |
|---|---|---|
| `effect:yielded` | `yield` | `scopeId` → `coroutineId` |
| `effect:resolved` | `next` (status: "ok") | `effectId` pairing preserved |
| `effect:errored` | `next` (status: "err") | Merged into `next` with status discriminant |
| `scope:created` | `spawn` | Only emitted for durable child coroutines, not internal scopes |
| `scope:destroyed` | `close` | Three-way status: ok/err/cancelled |
| `scope:set` | *(removed)* | Informational; never consumed during replay |
| `scope:delete` | *(removed)* | Informational; never consumed during replay |
| `workflow:return` | `close` (status: "ok") | Merged into `close` |

### Stream Reading Example

A workflow that spawns a child, sleeps, and returns:

```
offset 0: spawn  { coroutineId: "root", childCoroutineId: "c1" }
offset 1: yield  { coroutineId: "c1",   effectId: "e0", description: "sleep(500)" }
offset 2: yield  { coroutineId: "root", effectId: "e1", description: "sleep(100)" }
offset 3: next   { coroutineId: "root", effectId: "e1", status: "ok" }
offset 4: next   { coroutineId: "c1",   effectId: "e0", status: "ok" }
offset 5: close  { coroutineId: "c1",   status: "ok", value: 42 }
offset 6: close  { coroutineId: "root", status: "ok", value: 42 }
```

The stream is a self-describing, bidirectional conversation log. Readers can
filter by `coroutineId` to see one coroutine's story, or read the full
interleaved stream for the complete workflow history.

## Public API (Initial)

- `spawn(op: () => DurableOperation<T>): DurableOperation<Task<T>>`
- `all(ops: readonly DurableOperation<any>[]): DurableOperation<any[]>`
- `race(ops: readonly DurableOperation<any>[]): DurableOperation<any>`
- `resource(factory): DurableOperation<T>`
- `scoped(op: () => DurableOperation<T>): DurableOperation<T>`
- `durable(op: () => DurableOperation<T>, options?): DurableOperation<T>`
- Stream/reducer primitives exported as needed (`DurableStream`,
  `DurableReducer`, error types).

## Runtime Invariants

1. **Spawn registration**: A `spawn` event is appended to the stream before
   the child coroutine begins execution. This ensures replay can reconstruct
   the coroutine tree.
2. **Halt persistence**: A `close { status: "cancelled" }` event is appended
   before scope teardown completes. Cancellation intent is durable.
3. **Resource determinism**: Resource acquire/release lifecycle is recorded
   deterministically; replay does not re-acquire already-recorded acquisitions.
4. **All completeness**: All branch resolutions/failures (`next`/`close` events
   for each child) are recorded before the join resolution.
5. **Race cancellation**: The recorded winner's `close { status: "ok" }` is
   followed by `close { status: "cancelled" }` for each loser.
6. **Replay suppression**: Recorded effects never call live `effect.enter()`
   again. During replay, stored `next` values are fed directly to the generator.
7. **Single-stream transactionality**: All events from all coroutines in a
   workflow are appended to one stream. The stream offset after the last event
   is the single checkpoint for the entire workflow.

## Package Layout (Proposed)

- `durable/` (new workspace package)
  - `src/index.ts`
  - `src/types.ts` (`DurableOperation`, metadata, public errors)
  - `src/runtime.ts` (entrypoint wiring)
  - `src/reducer.ts` (durable reducer integration)
  - `src/stream.ts` (stream interfaces/helpers)
  - `src/primitives/` (`spawn.ts`, `all.ts`, `race.ts`, etc.)
  - `test/` (unit + replay integration tests)

## Test Plan

- Unit: type contracts + metadata validation.
- Unit: reducer replay behavior for each primitive.
- Integration:
  - spawn/halt propagation and nested scope teardown
  - all/race deterministic replay
  - resource acquire/release replay correctness
  - cancellation replay parity
- Regression: divergence detection and recorded-error replay.

## Branch and PR Plan

### Branch

- Create feature branch from `main`: `feat/durable-native-package-spec`

### PR Scope (Foundational)

1. Scaffold new `durable` workspace package.
2. Implement `DurableOperation` type + durable-native primitive exports.
3. Wire durable reducer/stream runtime for package-local APIs.
4. Add initial invariant tests for spawn/halt/all/race/resource.
5. Add package docs (`README`) explaining durable-native boundary and
   semantics.

### PR Title

- `feat(durable): add @effectionx/durable durable-native runtime`

### PR Body Structure

- Motivation: explicit durable boundary, no prefix compatibility layer.
- Approach: new package, durable-native primitives, invariants.
- Validation: test matrix + replay parity results.
- Follow-ups: migration/adapters (separate PRs, if desired).

### Review Checklist

- No plain Effection operations accepted by durable public APIs.
- Durable invariants are covered by tests.
- Replay avoids live effect entry for recorded events.
- Halt/cancellation semantics match recorded lifecycle.
- No accidental dependency on compatibility behavior from
  `@effectionx/durably`.
