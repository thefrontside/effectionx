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

1. Spawn registration invariant: spawned durable tasks are registered in stream
   metadata before execution.
2. Halt invariant: halt must persist cancellation intent before scope teardown
   completes.
3. Resource invariant: resource acquire/release lifecycle is recorded
   deterministically; replay does not re-acquire already-recorded acquisitions.
4. All invariant: all branch resolutions/failures are recorded before join
   resolution.
5. Race invariant: recorded winner short-circuits losers with durable
   cancellation markers.
6. Replay invariant: recorded effects never call live `effect.enter()` again.

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
