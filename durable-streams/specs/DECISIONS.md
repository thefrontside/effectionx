# Decision Log

Every architectural, technical, and implementation decision made during the
build of the durable execution integration is recorded here. Decisions are
append-only — superseded decisions are marked `[SUPERSEDED by DEC-NNN]` but
never deleted.

Updated before completion of every phase and committed at the end of each phase.

---

## DEC-001: Use Deno as project runtime [SUPERSEDED]

- **Phase:** 0 (Scaffolding)
- **Date:** 2026-02-28
- **Context:** Need a runtime for the project. Effection 4.x uses Deno as its
  primary development tool and publishes to JSR.
- **Options considered:**
  1. Node.js with npm/TypeScript toolchain
  2. Deno with JSR imports
- **Decision:** Deno as the project runtime (deno.json, deno test, JSR imports)
- **Rationale:** User preference. Effection itself uses Deno for development.
  JSR imports are first-class. `deno test` eliminates the need for a separate
  test runner.
- **Consequences:** npm packages (durable-streams) are imported via `npm:`
  specifiers. Native addons (lmdb in @durable-streams/server) may need
  `nodeModulesDir: "auto"` if build scripts are required.
- **Update:** The project has since moved to the `effectionx` monorepo using
  Node.js 22 with pnpm, TypeScript 5+, and the Node.js test runner. The
  `@effectionx/durable-streams` package is published to npm, not JSR.

## DEC-002: Target effection 4.1.0-alpha.5 with /experimental endpoint

- **Phase:** 0 (Scaffolding)
- **Date:** 2026-02-28
- **Context:** Need the latest Effection with the Api middleware system for
  intercepting scope lifecycle events.
- **Options considered:**
  1. Effection 4.0.2 (stable) — no `/experimental` endpoint
  2. Effection 4.1.0-alpha.5 — has `createApi`, `api.Scope`, `api.Main`
- **Decision:** Use `@effection/effection@4.1.0-alpha.5`
- **Rationale:** The `/experimental` endpoint exposes `api.Scope` with
  `create`, `destroy`, `set`, `delete` operations and `around()` middleware.
  This is the extension point needed for intercepting scope destruction to
  emit Close events (future phases). The alpha is published to JSR and works
  with Deno.
- **Consequences:** API surface may change before 4.1 stable. We depend on
  the experimental endpoint which is explicitly unstable. We should pin the
  exact version and be prepared to adapt.
- **Update:** Now pinned at `effection@4.1.0-alpha.7` via pnpm overrides in
  the effectionx monorepo root `package.json`. Tracking issue #181 to remove
  the override when a stable release is available.

## DEC-003: Single package structure

- **Phase:** 0 (Scaffolding)
- **Date:** 2026-02-28
- **Context:** Could structure as a monorepo with separate packages
  (core protocol, durable-streams backend, test utilities) or a single package.
- **Options considered:**
  1. Monorepo with separate packages from day one
  2. Single package, split later when boundaries stabilize
- **Decision:** Single package
- **Rationale:** The boundaries between core protocol, effects, and backend
  adapter are not yet proven. Premature separation adds overhead without
  benefit. Split when the interfaces are stable and there's a concrete need
  (e.g., supporting a second backend).
- **Consequences:** All code lives under `lib/`. The module entry point is
  `lib/mod.ts`. Re-exports control the public API surface.
- **Update:** The project has since been split into two packages in the
  effectionx monorepo: `@effectionx/durable-streams` (core protocol, replay,
  effects, combinators) and `@effectionx/durable-effects` (higher-level
  durable operations like durableExec, durableFetch, etc.). Source files live
  at the package root (e.g., `effect.ts`, `run.ts`) rather than under `lib/`.
  The entry point is `mod.ts`.

## DEC-004: Use @std/assert for test assertions [SUPERSEDED]

- **Phase:** 0 (Scaffolding)
- **Date:** 2026-02-28
- **Context:** Need an assertion library for `deno test`.
- **Options considered:**
  1. `https://deno.land/std` URL imports (legacy style)
  2. `jsr:@std/assert` (modern JSR-style)
- **Decision:** `jsr:@std/assert@1` via import map
- **Rationale:** JSR is the standard for Deno dependencies. Avoids uncached
  URL resolution issues.
- **Consequences:** Added to deno.json imports.
- **Update:** Tests now use the Node.js test runner (`node --test`) with
  `@effectionx/bdd` for describe/it/beforeEach and `expect` for assertions.

## DEC-005: Sequential workflows only in initial scope

- **Phase:** 0 (Scaffolding)
- **Date:** 2026-02-28
- **Context:** The protocol spec covers sequential execution, fork/join,
  races, cancellation, and version gates. Implementing everything at once
  is risky.
- **Options considered:**
  1. Full set (call, sleep, action, spawn, all, race, versionCheck) from start
  2. Minimal: core + call + sleep, add spawn/all/race in a second phase
- **Decision:** Minimal initial scope: ReplayIndex, DurableEffect,
  durableCall, durableSleep, versionCheck, durableRun. No spawn/all/race.
- **Rationale:** Enough to validate core replay correctness (Tier 1) and
  divergence detection (Tier 2) — the fundamental protocol. Structured
  concurrency (Tier 3-4) adds significant complexity that benefits from
  a solid foundation.
- **Consequences:** Spec tests 15-27 (structured concurrency, deterministic
  identity) are deferred. Close event emission can be simplified to
  try/finally in durableRun rather than scope middleware.

## DEC-006: Tier 1-2 tests first

- **Phase:** 0 (Scaffolding)
- **Date:** 2026-02-28
- **Context:** The spec defines 37 tests across 7 tiers. Need to decide
  initial test coverage target.
- **Options considered:**
  1. Tier 1-2 first (tests 1-14)
  2. Tier 1-4 all at once
- **Decision:** Tier 1-2 first
- **Rationale:** Core replay correctness (Tier 1, tests 1-7) and divergence
  detection (Tier 2, tests 8-14) validate the fundamental protocol. These
  are achievable with sequential workflows. Tier 3-4 require spawn/all/race.
- **Consequences:** Tests 15-37 deferred to future phases.

## DEC-007: Protocol types are Effection-independent

- **Phase:** 0 (Scaffolding)
- **Date:** 2026-02-28
- **Context:** The protocol types (DurableEvent, Yield, Close, Result, etc.)
  could depend on Effection types or be standalone.
- **Decision:** Protocol types in `types.ts` have zero Effection imports.
  The DurableEffect and Workflow types that bridge to Effection are defined
  separately (also in types.ts for now, but with a placeholder shape).
- **Rationale:** The protocol is designed to be runtime-agnostic (spec §1.2).
  Keeping types independent enables potential reuse with other runtimes and
  makes the types testable without Effection.
- **Consequences:** The DurableEffect interface in types.ts uses a generic
  shape for `enter()` that will be aligned with Effection's exact Effect
  interface in Phase 1.

## DEC-008: Three distinct divergence error types

- **Phase:** 0 (Scaffolding)
- **Date:** 2026-02-28
- **Context:** Spec §6.2-6.3 defines three divergence conditions: description
  mismatch, generator finishes early, generator continues past close.
- **Options considered:**
  1. Single DivergenceError class with a `kind` field
  2. Three separate error classes
- **Decision:** Three classes: `DivergenceError`, `EarlyReturnDivergenceError`,
  `ContinuePastCloseDivergenceError`. All share `name = "DivergenceError"`.
- **Rationale:** Each carries different diagnostic fields (expected/actual
  descriptions vs. consumed/total counts). Separate classes enable precise
  `instanceof` checks in tests while sharing the same error name for catch-all
  handling.
- **Consequences:** Error handling code can match on the common name
  `"DivergenceError"` or use instanceof for specific cases.

## DEC-009: Workflow<T> = Generator<DurableEffect<unknown>, T, unknown>

- **Phase:** 1 (Protocol Types)
- **Date:** 2026-02-28
- **Context:** Need a type that constrains generator yields to durable effects
  only, while remaining assignable to Effection's Operation<T>.
- **Options considered:**
  1. `Iterable<DurableEffect<unknown>, T, unknown>` — TypeScript's Iterable
     only has 1 type parameter in the standard lib, cannot constrain yields.
  2. `Generator<DurableEffect<unknown>, T, unknown>` — has 3 type parameters
     (Yield, Return, Next).
  3. Custom interface extending both Generator and Operation.
- **Decision:** `Generator<DurableEffect<unknown>, T, unknown>`
- **Rationale:** Generator's 3 type parameters give TypeScript enough
  information to enforce the yield constraint. When a user writes
  `function*(): Workflow<T>`, TS checks that every `yield` expression
  produces a value assignable to `DurableEffect<unknown>`. Verified:
  `yield* sleep(1000)` inside a Workflow produces TS2741 error.
- **Consequences:** Workflow generators use `yield` (not `yield*`) for direct
  DurableEffect interaction, and `yield*` for delegating to other Workflows.
  The cast `as T` is needed when `yield`-ing a DurableEffect since TS types
  the yield expression as `unknown`.

## DEC-010: DurableEffect mirrors Effection's Effect interface shape exactly

- **Phase:** 1 (Protocol Types)
- **Date:** 2026-02-28
- **Context:** DurableEffect needs to be structurally compatible with
  Effection's `Effect<T>` interface so the reducer processes it identically.
- **Decision:** DurableEffect<T> has the same `description: string` and
  `enter(resolve, routine)` signature as Effect<T>, plus the additional
  `effectDescription: EffectDescription` field.
- **Rationale:** Effection's Effect<T> uses:
  - `enter(resolve: Resolve<Result<T>>, routine: Coroutine)`
  - returns `(resolve: Resolve<Result<void>>) => void` (teardown)
  - `Result<T> = { ok: true, value: T } | { ok: false, error: Error }`
  DurableEffect replicates this exactly. The extra field doesn't affect
  structural compatibility — the reducer ignores unknown properties.
- **Consequences:** Two different "Result" types exist — Effection's internal
  `{ ok, value/error }` and the protocol's `{ status, value/error }`. We
  define `EffectionResult<T>` in types.ts to bridge them without importing
  from Effection.

## DEC-011: CoroutineView — minimal interface instead of importing Coroutine

- **Phase:** 1 (Protocol Types)
- **Date:** 2026-02-28
- **Context:** The `enter()` callback receives an Effection `Coroutine` object.
  We need `routine.scope` to read DurableContext. Coroutine is marked
  `@ignore` in Effection's types (not part of public API).
- **Options considered:**
  1. Import Coroutine type from Effection internals
  2. Use `unknown` and cast at runtime
  3. Define a minimal CoroutineView interface with only what we need
- **Decision:** Define `CoroutineView` with `scope` property typed to match
  Scope's `get()`, `expect()`, `set()` methods.
- **Rationale:** Avoids depending on Effection's private API surface. The
  minimal interface documents exactly which Coroutine fields we rely on.
  If Effection's internal shape changes, the break is localized to this
  interface.
- **Consequences:** At runtime, `enter()` receives the full Coroutine object.
  TypeScript sees only our CoroutineView. This works because we only access
  `scope.expect(context)` which is a public Scope method.

## DEC-012: Verified — routine.scope is accessible in enter() callback

- **Phase:** 1 (Protocol Types)
- **Date:** 2026-02-28
- **Context:** The key risk identified in the plan was whether `routine.scope`
  is accessible from within `enter()`. Needed to confirm from Effection 4.1
  alpha source.
- **Decision:** Confirmed. Effection's `Coroutine` interface in
  `lib/types.ts` (line ~465) has `scope: Scope`. The reducer passes the
  full Coroutine object to `enter()`. We can access `routine.scope.expect(ctx)`
  to read DurableContext from within a DurableEffect's enter method.
- **Rationale:** Verified by reading Effection 4.1.0-alpha.5 source:
  `interface Coroutine<T> { scope: Scope; data: { ... }; next(...); return(...); }`
- **Consequences:** No workaround needed. The direct approach from the
  integration doc works.

## DEC-013: ReplayIndex follows spec §4.1 exactly with no extensions

- **Phase:** 2 (ReplayIndex)
- **Date:** 2026-02-28
- **Context:** The spec provides a reference implementation of ReplayIndex in
  §4.1. Could add extra features (e.g., event filtering, offset tracking).
- **Decision:** Follow the spec exactly. Only additions are `getCursor()` and
  `yieldCount()` which are trivial derived accessors for diagnostics/testing.
- **Rationale:** The ReplayIndex is a critical correctness component. Staying
  minimal and spec-aligned reduces the risk of subtle bugs. Extra features
  can be added if needed.
- **Consequences:** All replay logic depends on this class. It is thoroughly
  tested (21 tests covering empty index, single/multiple yields, close events,
  interleaved coroutines, race scenarios, and spec examples).

## DEC-014: createDurableEffect handles replay/live dispatch inside enter()

- **Phase:** 3 (Durable Runner)
- **Date:** 2026-02-28
- **Context:** The protocol requires each durable effect to check the replay
  index, validate descriptions, and either feed stored results or execute
  live with persist-before-resume. This logic could live in a central
  runner/reducer or inside each effect.
- **Decision:** Each `DurableEffect.enter()` handles its own replay/live
  dispatch internally, reading `DurableContext` from the scope via
  `routine.scope.expect(DurableCtx)`.
- **Rationale:** Keeps the Effection reducer completely untouched. The reducer
  calls `enter()` on every effect — whether `enter()` resolves synchronously
  (replay) or asynchronously (live + persist) is invisible to it. This is
  the architecture from the integration doc §5.1.
- **Consequences:** No changes to Effection internals. The `createDurableEffect`
  factory encapsulates all replay/persistence logic. Each workflow-enabled
  effect (durableSleep, durableCall, etc.) is a thin wrapper over this factory.

## DEC-015: Workflow<T> is directly assignable to Operation<T> — no casts needed

- **Phase:** 3 (Durable Runner)
- **Date:** 2026-02-28
- **Context:** `durableRun` calls `scope.run(workflow)` where workflow returns
  `Workflow<T>` (which is `Generator<DurableEffect<unknown>, T, unknown>`).
  Need to confirm this is assignable to Effection's `Operation<T>`.
- **Options considered:**
  1. Cast `workflow as () => Operation<T>` or use `as any`
  2. Rely on structural assignability
- **Decision:** No cast needed. `DurableEffect` extends `Effect` structurally,
  and TypeScript's covariant yield type means `Generator<DurableEffect, T, unknown>`
  is assignable to the iterator type that `Operation<T>` expects.
- **Rationale:** Verified empirically — `scope.run(workflow)` compiles without
  any type assertions. This confirms the type system design from DEC-009/010.
- **Consequences:** The type boundary between Workflow and Operation is seamless.

## DEC-016: durableRun short-circuits on existing Close event

- **Phase:** 3 (Durable Runner)
- **Date:** 2026-02-28
- **Context:** When `durableRun` is called with a stream that already contains
  a Close event for the root coroutine, should it re-run the workflow or
  return the stored result directly?
- **Decision:** Short-circuit. If `replayIndex.hasClose(coroutineId)` is true,
  return the stored result from the Close event without creating a scope or
  running the workflow.
- **Rationale:** A Close event means the workflow completed in a previous run.
  Re-running it would be wasteful and could produce unexpected behavior
  (e.g., side effects from live effects). The stored result is the canonical
  outcome.
- **Consequences:** Fully-completed workflows return instantly. The early-return
  check uses `hasClose()` (not `isFullyReplayed()`, which requires cursor
  advancement that hasn't happened yet).

## DEC-017: Persist-before-resume via Strategy B (async append + deferred resolve)

- **Phase:** 3 (Durable Runner)
- **Date:** 2026-02-28
- **Context:** The spec §5 defines the persist-before-resume invariant with
  three strategies. Need to choose one for the Effection integration.
- **Decision:** Strategy B — the effect's `enter()` calls `stream.append(event)`
  and places `resolve()` inside the `.then()` callback. The generator does
  not advance until the durable write completes.
- **Rationale:** This is the natural fit for Effection's async resolve model.
  The reducer waits for `resolve()` to be called, so deferring it until after
  the append guarantees persist-before-resume. Verified by the ordering test
  (execute → persist → resume for each step).
- **Consequences:** Live execution has one async hop per effect (the stream
  append). During replay, `resolve()` is called synchronously — zero async
  overhead.

## DEC-018: durableCall constrains T extends Json for serializability

- **Phase:** 3 (Durable Runner)
- **Date:** 2026-02-28
- **Context:** `durableCall<T>(name, fn)` stores the function's return value
  in the journal. The value must be JSON-serializable per the protocol.
- **Decision:** Constrain `T extends Json` at the type level.
- **Rationale:** Catches non-serializable return values at compile time rather
  than silently producing corrupt journal entries. The `Json` type from
  `types.ts` covers all JSON-serializable values.
- **Consequences:** Users must ensure their async functions return JSON-compatible
  values. Complex objects (Dates, class instances) need explicit serialization.
  The constraint is intentionally strict — relaxing it later is easy, but
  tightening it would be a breaking change.

## DEC-019: Delegate durableAll to Effection's native all() via child Operation wrapping

- **Phase:** 4 (Structured Concurrency)
- **Date:** 2026-02-28
- **Context:** `durableAll` needs to run multiple child workflows concurrently,
  wait for all to complete, and propagate errors so that parent generators
  can catch them via try/catch (error boundary pattern, spec §7.3).
- **Options considered:**
  1. `scoped()` + `spawn()` + sequential join loop
  2. `spawn()` + sequential join loop + manual `task.halt()` on error
  3. Wrap children as `Operation<T>` objects, delegate to Effection's `all()`
- **Decision:** Option 3 — wrap each child workflow in an Operation that
  runs `runDurableChild()`, then pass the array to Effection's `all()`.
- **Rationale:** Effection's `all()` uses the internal `trap()` mechanism
  which provides proper error isolation — child errors are catchable by
  the caller via try/catch, and remaining siblings are cancelled on failure.
  Option 1 (`scoped()`) was tried first but `scoped()` transforms child
  errors into "halted" when the child's finally/catch blocks perform async
  work (via `yield* call()`), because scope teardown kills the async
  operation mid-flight. Option 2 works for error propagation but errors
  from spawned children fail the parent scope directly (not catchable by
  the parent generator's try/catch).
- **Consequences:** `durableAll` and `durableRace` delegate to Effection's
  native combinators. The durable layer wraps each child in an Operation
  that (1) checks for replay short-circuit, (2) sets DurableCtx with a
  child coroutineId, and (3) emits Close events in finally. This is a
  thin wrapper that preserves Effection's error semantics perfectly.

## DEC-020: Error catching from durableAll — three approaches and their failure modes

- **Phase:** 4 (Structured Concurrency)
- **Date:** 2026-02-28
- **Context:** When a child in `durableAll` throws, the error must propagate
  to the parent in a way that: (a) preserves the original error identity
  (message, stack), (b) allows try/catch in the parent generator to intercept
  it, and (c) properly cancels sibling children. Three approaches were tested.
- **Finding — `scoped()` + `spawn()` + join loop:**
  `scoped()` creates a hermetic scope. When a spawned child throws, the
  scope is torn down. If the child's error/finally handler performs any
  async operation (e.g., `yield* call(() => stream.append(closeEvent))`),
  the scope teardown kills that async operation mid-flight, and the error
  that reaches the caller is "halted" (from `task.ts:98`) rather than the
  original "child-boom". Even without async in the error path, the join
  loop's `yield* task` receives "halted" because the scope destruction
  interrupts the task's iterator. **This approach masks error identity.**
- **Finding — bare `spawn()` + join loop + manual `task.halt()`:**
  Without `scoped()`, spawned children that throw propagate the error
  through Effection's scope hierarchy. The parent task fails with the
  correct error message. However, errors from spawned children are
  delivered via `iterator.return()` (scope cancellation), not via the
  generator's normal execution path. This means try/catch in the parent
  generator **cannot** intercept the error — it bypasses the catch block
  entirely. **This approach breaks error boundaries.**
- **Finding — delegate to Effection's native `all()`:**
  Effection's `all()` uses the internal `trap()` function which creates
  a proper catch boundary. Child errors are caught, remaining siblings are
  halted, and the error re-thrown in a way that is catchable by the caller's
  try/catch. Error identity is preserved. **This is the only approach that
  satisfies all three requirements.**
- **Decision:** Use Effection's native `all()` and `race()` as the
  concurrency substrate, wrapping each child in an Operation that adds
  durable semantics (replay, Close events, coroutineId).
- **Consequences:** The durable combinators depend on Effection's internal
  `trap()` behavior (accessed indirectly through `all()` and `race()`).
  If `trap()` semantics change in a future Effection version, the error
  boundary behavior may change. This is acceptable since `all()` and
  `race()` are public API with well-defined error semantics.

## DEC-021: durableRun accepts Operation<T>, not just Workflow<T>

- **Phase:** 4 (Structured Concurrency)
- **Date:** 2026-02-28
- **Context:** `durableRun` originally accepted `() => Workflow<T>` to enforce
  that only durable-safe effects are yielded. But `durableAll`/`durableRace`
  return `Operation<T>` (they yield infrastructure effects like `useScope`,
  `spawn` internally). A workflow that uses combinators yields both
  DurableEffect and Effect values, making it `Operation<T>` not `Workflow<T>`.
- **Decision:** Widen `durableRun`'s parameter to
  `() => Workflow<T> | Operation<T>`.
- **Rationale:** Type safety is still enforced at the leaf level — `durableCall`,
  `durableSleep`, etc. return `Workflow<T>`. But the top-level workflow that
  uses combinators naturally returns `Operation<T>`. Requiring `Workflow<T>`
  at the top level would force users to cast or use `as any`, which is worse
  than accepting the union. Existing `Workflow<T>` code still works without
  changes since `Workflow<T>` is a subtype of `Operation<T>`.
- **Consequences:** The type-level guarantee that only durable effects can be
  yielded is no longer enforced at the `durableRun` boundary. It is enforced
  at the combinator/operation level instead. This is a pragmatic tradeoff.

## DEC-022: runDurableChild emits Close events in finally for cancellation

- **Phase:** 4 (Structured Concurrency)
- **Date:** 2026-02-28
- **Context:** When a child is cancelled (e.g., race loser, sibling of a
  failed child), Effection calls `iterator.return()` which triggers
  `finally` blocks but not `catch`. The protocol requires Close(cancelled)
  events for cancelled coroutines.
- **Decision:** `runDurableChild` tracks whether it completed via ok/err
  paths using a `closeEvent` variable. In the `finally` block, if
  `closeEvent` is still undefined, the child was cancelled, and a
  Close(cancelled) event is emitted.
- **Rationale:** This is the only way to detect cancellation in a generator
  without modifying the Effection runtime. The pattern: set `closeEvent` in
  try (ok) and catch (err), check for undefined in finally (cancelled).
- **Consequences:** Every child exit path (ok, err, cancelled) writes a
  Close event. The `yield* call(() => stream.append(...))` in finally may
  itself be interrupted during scope teardown — but this is acceptable for
  the in-memory stream. A production stream adapter would need to handle
  partial writes.

## DEC-023: destroy() errors swallowed in durableRun finally block

- **Phase:** 4 (Structured Concurrency)
- **Date:** 2026-02-28
- **Context:** `durableRun` calls `await destroy()` in its finally block.
  When the workflow fails (e.g., child error propagated up), `destroy()`
  may throw "halted" because the scope is in an error state. In JavaScript,
  if a `finally` block throws, it replaces the original error from the
  catch block.
- **Decision:** Wrap `destroy()` in a try/catch and swallow the error.
- **Rationale:** The original workflow error is more informative than
  "halted". Scope cleanup errors are expected when the workflow failed.
  The scope's resources are cleaned up regardless.
- **Consequences:** Errors during scope destruction are silently swallowed.
  This is acceptable because the scope's destruction is a best-effort
  cleanup — the important state (the durable stream) has already been
  written to by the catch block before finally runs.

## DEC-024: Cancelled children replay via suspend(), not throw

- **Phase:** 4 (Structured Concurrency)
- **Date:** 2026-02-28
- **Context:** During replay of a `durableRace`, a loser child has
  `Close(cancelled)` in the journal. The original implementation threw
  a `CancelledError`, but this surfaced as an unexpected race error
  rather than silently replaying.
- **Decision:** When `runDurableChild` encounters `Close(cancelled)` during
  replay, it calls `yield* suspend()` instead of throwing. The child blocks
  until the parent combinator (race) cancels it naturally via Effection's
  structured concurrency teardown.
- **Rationale:** In the original live run, the loser was cancelled by
  Effection calling `iterator.return()` — it never threw an error; it
  simply stopped executing. `suspend()` reproduces this behavior exactly:
  the child hangs until cancelled, matching the original execution path.
  The `Close(cancelled)` event already exists in the journal, so the
  finally block skips re-emitting it (checked via `replayIndex.hasClose()`).
- **Consequences:** Replay of race losers is invisible — they block and
  get cancelled just like the original run. No duplicate Close events.

## DEC-025: Test 27 — dynamic spawn count is not a divergence error

- **Phase:** 4 (Structured Concurrency)
- **Date:** 2026-02-28
- **Context:** The protocol specification (§14, test 27) says that replaying
  `all([a, b])` with `all([a, b, c])` should produce `DivergenceError`.
  However, in our implementation, this succeeds gracefully: children a and b
  replay from the journal (their Close events exist), child c executes live
  (no journal entries for root.2), and the post-join effects continue normally.
- **Decision:** Our test 27 asserts success, not divergence. The spec's
  expected behavior is incorrect for our architecture.
- **Rationale:** Divergence detection operates at the Yield-event level:
  when a durable effect (durableCall, durableSleep) is yielded, the replay
  index checks if a matching Yield event exists for that coroutineId+cursor.
  A new child (root.2) simply has no replay entries, so its effects execute
  live — indistinguishable from a partial replay after a crash. There is no
  structural check that says "the number of children in an all() must match
  the journal." Such a check would be overly restrictive and would prevent
  legitimate workflow evolution (adding new parallel branches).
- **Consequences:** Workflows can add new children to `durableAll` without
  divergence errors. This is a deliberate relaxation of the spec. The spec
  should be updated to reflect this (test 27 verifies graceful handling,
  not DivergenceError).

## DEC-026: Direct HTTP append with raw fetch, not IdempotentProducer

- **Phase:** 5 (HttpDurableStream)
- **Date:** 2026-02-28
- **Context:** The `@durable-streams/client` package provides an
  `IdempotentProducer` class designed for throughput workloads (fire-and-forget
  + background flush). Need to decide whether to use it or raw `fetch()`.
- **Options considered:**
  1. `IdempotentProducer` with `lingerMs=0` and await flush after every append
  2. Raw `fetch()` with manual producer headers
- **Decision:** Raw `fetch()` with manual `Producer-Id`, `Producer-Epoch`,
  `Producer-Seq` headers on each POST.
- **Rationale:** Durable execution requires synchronous acknowledgment on
  every write (persist-before-resume, spec §5). Setting `lingerMs=0` and
  awaiting flush after every append makes the producer pure overhead — it
  batches nothing and adds an abstraction layer. Raw fetch captures
  `Stream-Next-Offset` from every response, which is needed for future
  `tail()` calls.
- **Consequences:** More code in `HttpDurableStream.doAppend()` but full
  control over request/response handling. Error types (`StaleEpochError`,
  `SequenceGapError`) are still imported from the client package.

## DEC-027: Promise chain serialization for concurrent appends

- **Phase:** 5 (HttpDurableStream)
- **Date:** 2026-02-28
- **Context:** When `durableAll` runs N children, their effects may resolve
  in the same tick. Each child's `createDurableEffect.enter()` calls
  `stream.append()` — producing concurrent promises. If two POSTs with
  seq=5 and seq=6 arrive out of order (HTTP/2 multiplexing), the server
  returns 409 (sequence gap).
- **Options considered:**
  1. Mutex/lock around append
  2. Promise chain serialization
  3. Accept 409 and retry with correct seq
- **Decision:** Promise chain serialization. Sequence numbers are assigned
  synchronously (before any async work). HTTP calls are chained behind
  `this.pending`: `const p = this.pending.then(() => this.doAppend(...));
  this.pending = p.catch(() => {});`
- **Rationale:** Each caller still awaits their own append promise. Ordering
  matches seq assignment order. The `p.catch(() => {})` pattern prevents
  failed appends from blocking future ones in the chain, but errors still
  propagate to the original caller. This is simpler than a mutex and avoids
  the complexity of retry logic.
- **Consequences:** Appends execute in strict sequence order. A fatal error
  (e.g., StaleEpochError) sets `this.fatalError` so future appends fail-fast
  without making HTTP calls.

## DEC-028: Close event append in finally block is cancellable (best-effort)

- **Phase:** 5 (HttpDurableStream)
- **Date:** 2026-02-28
- **Context:** `runDurableChild` (in `combinators.ts`) appends Close
  events in a `finally` block via `yield* call(() => stream.append(...))`.
  When the parent scope is torn down (e.g., race winner cancels losers),
  this async operation can be interrupted.
- **Decision:** Accept that Close event appends in finally blocks are
  best-effort. Missing Close events just mean the child re-executes on
  replay (idempotent).
- **Rationale:** Effection does not currently expose an uncancellable
  context for finally blocks. The in-memory stream completes synchronously
  so this is not an issue in tests. For the HTTP adapter, the serialized
  POST may be interrupted mid-flight. The protocol handles this gracefully:
  a missing Close event means the child has no replay short-circuit, so it
  re-executes live on the next run.
- **Consequences:** In rare cases (parent cancellation racing with child
  cleanup), a Close event may not be persisted. The workflow remains correct
  because re-execution is idempotent. A future enhancement could use an
  uncancellable context when Effection exposes one.

## DEC-029: Track Stream-Next-Offset from every HTTP response

- **Phase:** 5 (HttpDurableStream)
- **Date:** 2026-02-28
- **Context:** The Durable Streams server returns a `Stream-Next-Offset`
  header on every successful append (200) and on reads. This is an opaque
  offset string (e.g., `0000000000000000_0000000000000118`) that represents
  the position after the last written event.
- **Decision:** Store `lastOffset` from both reads (`res.offset` from the
  client's `stream()` function) and writes (`Stream-Next-Offset` header
  from raw fetch responses).
- **Rationale:** The offset is the resumption point for future `tail()`
  calls (SSE/long-poll tailing, not yet implemented). Cheap to capture now,
  annoying to retrofit later. The field is public (`lastOffset`) for
  inspection in tests.
- **Consequences:** `lastOffset` is updated as a side effect of `readAll()`
  and `append()`. Nothing consumes it yet, but it's available for the
  tailing feature when implemented.

## DEC-030: durableEach — pre-fetch pattern with context-based state sharing

- **Phase:** 6 (Durable Iteration)
- **Date:** 2026-02-28
- **Context:** Need a durable iteration primitive for consuming a
  `DurableSource<T>` (e.g., a message queue, paginated API) inside a
  Workflow. Each item fetch must be journaled so iteration survives
  crashes and replays from the journal.
- **Decision:** Implement `durableEach(name, source)` / `durableEach.next()`
  mirroring Effection's `each()` / `each.next()` pattern. Key choices:
  1. **Pre-fetch pattern**: `durableEach()` fetches the first item,
     returns a synchronous iterable. `durableEach.next()` fetches
     subsequent items. This makes `for...of` work with durable effects.
  2. **Context-based state sharing**: `DurableEachContext` Effection
     context stores `{ name, source, current, advanced }`, shared
     between `durableEach()` and `durableEach.next()` via `useScope()`.
  3. **`{ value: T } | { done: true }` wrapper**: Stored in journal
     to avoid null-as-done ambiguity (null is valid JSON).
  4. **Single fetch helper** (`durableEachFetch`): Both initial and
     subsequent fetches use the same helper with description
     `{ type: "each", name }`. Same journal format, same replay path.
  5. **Advance guard**: Runtime detection of missing
     `yield* durableEach.next()` — iterator throws if re-entered
     without advance. Prevents infinite loops on same item.
  6. **Source teardown**: Both effect-level teardown (in
     `createDurableEffect`) and scope-level cleanup (via `ensure()`)
     call `source.close?.()`. Dual cleanup is safe for idempotent
     close functions.
  7. **Operation, not Workflow**: Both `durableEach` and
     `durableEach.next()` use `useScope()` / `ensure()`, making them
     `Operation<T>` at the type level. Consistent with combinators
     (`durableSpawn`, `durableAll`, etc.).
- **Rationale:** Mirrors Effection's `each()` API for developer
  familiarity. The pre-fetch pattern is the only way to make `for...of`
  work with async durable effects (synchronous iterator protocol
  requires the value to be available when `next()` is called). The
  `{ value: T } | { done: true }` wrapper prevents the null sentinel
  problem documented in the integration spec §12.6.
- **Consequences:** Each iteration produces one Yield event in the
  journal. Journal size grows linearly with items consumed. For
  long-running streams, a future Continue-As-New feature (§15.2) or
  cursor-based checkpointing will bound journal growth. Nested
  `durableEach` calls require separate child scopes (inner clobbers
  outer context).

## DEC-031: Divergence API — pluggable policy via Effection's Api pattern

- **Date:** 2026-03-01
- **Context:** Divergence detection (description mismatch, continue-past-close)
  was hard-coded in `createDurableEffect()` — every mismatch unconditionally
  threw `DivergenceError` or `ContinuePastCloseDivergenceError`. Users had no
  way to override this behavior (e.g., to switch a coroutine to live execution
  when the workflow code has intentionally changed).
- **Decision:** Delegate divergence policy to a `Divergence` API object using
  Effection's `Api<A>` pattern with `scope.around()` middleware support.
  - The API has one method: `decide(info: DivergenceInfo): DivergenceDecision`
  - `DivergenceInfo` is a discriminated union on `kind`: `"description-mismatch"` |
    `"continue-past-close"`, carrying context about the divergence
  - `DivergenceDecision` has two variants: `{ type: "throw"; error: Error }` |
    `{ type: "run-live" }`
  - Default behavior is strict: all divergences return `{ type: "throw" }`
  - Users override via `scope.around(Divergence, { decide: ([info], next) => ... })`
  - Since `durableRun` is an Operation (DEC-032), middleware is installed on
    the caller's scope before `yield*`-ing into `durableRun`
  - `decide()` is synchronous because it's called from `Effect.enter()`, which
    cannot yield. The middleware chain runs synchronously via `Divergence.invoke(scope, "decide", [info])`
  - When `run-live` is decided, `replayIndex.disableReplay(coroutineId)` is called
    and execution falls through to the live path via a labeled `replay:` block
  - The early-return divergence check in `durableRun` is skipped when replay is
    disabled for the root coroutine (the Divergence API already approved the change)
- **Implementation notes:**
  - Initially (alpha.5) could not use `createApi()` from
    `@effection/effection/experimental` due to a circular initialization bug
    (`api-internal.ts` imported `useScope` from `scope.ts`, creating:
    `api-internal → scope → scope-internal → api → api-internal`). The
    workaround was a hand-rolled `Divergence` object using `createContext()`
    and manual middleware dispatch mirroring `createApiInternal`'s logic.
  - **Fixed in alpha.6/alpha.7:** Charles replaced `yield* useScope()` in
    `api-internal.ts` with an inline `GetScope` Effect, breaking the cycle.
    The `Divergence` object now uses `createApi()` from the `experimental`
    entry point directly — eliminating ~100 lines of workaround code.
  - `ReplayIndex` gained `disableReplay(id)`, `isReplayDisabled(id)`, and guards
    in `peekYield()`, `hasClose()`, `isFullyReplayed()` to skip replay for disabled
    coroutines
  - `CoroutineView.scope` in `types.ts` uses Effection's full `Scope` type,
    since `Divergence.invoke()` and `scope.expect()` require it
- **Rationale:** Following the same pattern Effection uses for its own built-in
  APIs (Scope, Main) ensures composability. Middleware is scope-scoped, so
  different workflow runs can have different divergence policies. The `setup`
  callback on `durableRun` provides a clean injection point without requiring
  callers to manage scopes directly.
- **Consequences:** Divergence handling is now a pluggable policy rather than a
  hard-coded behavior. The `run-live` decision path enables future code evolution
  scenarios (e.g., "patching" in Temporal's terminology).

## DEC-032: Open EffectDescription replaces meta field for validation data

- **Date:** 2026-03-04
- **Context:** The ReplayGuard design (replay-guard-spec.md) originally proposed
  an optional `meta?: Record<string, Json>` field on Yield events to carry
  validation metadata (file paths, content hashes) for staleness detection.
  Charles objected to adding meta to the stream. Analysis revealed that meta
  was solving a problem that doesn't exist: file paths are effect *inputs*
  and belong in the effect description; content hashes are effect *outputs*
  and belong in result.value.
- **Decision:** Remove `meta` from the Yield event type entirely. Open
  `EffectDescription` to allow extra fields beyond `type` and `name` via
  an index signature `[key: string]: Json`. Divergence detection continues
  to compare only `type` and `name` — extra fields are stored verbatim and
  never checked.
- **Rationale:** Inputs belong with the description of what was requested.
  Outputs belong with the result of what was produced. This is the natural
  separation already established by the protocol. The ReplayGuard middleware
  reads `event.description.path` for the file path and
  `event.result.value.contentHash` for the recorded hash — no new protocol
  fields needed.
- **Consequences:** The Yield event type loses the `meta` field. Effect
  implementations that need staleness validation must return rich result
  objects that include validation data (e.g., content hash alongside content).
   The protocol remains a two-field `{ type, name }` identity check with
  open-ended storage for additional context.

## DEC-033: Operation-native HttpDurableStream via resource + Queue + worker

- **Date:** 2026-03-04
- **Context:** The DurableStream interface was made Operation-native (methods
  return `Operation<T>` instead of `Promise<T>`) as part of the
  operation-native-stream branch. HttpDurableStream still used Promise-based
  methods with a Promise chain for serializing concurrent appends (DEC-027).
  Simply wrapping the Promise chain with `yield* call()` would work but leaves
  Promise-based serialization hidden inside an Operation-native interface —
  not truly structured concurrency.
- **Options considered:**
  1. Wrap existing Promise chain with `yield* call()` — minimal change, but
     the serialization is still Promise-based under the hood
  2. Channel + spawned worker inside an Effection resource — fully
     Operation-native, clean cancellation, structured lifecycle
  3. Hybrid: Queue with deferred/signal per append
- **Decision:** Option 2. Replace the `HttpDurableStream` class with a
  `useHttpDurableStream(opts)` resource function that returns
  `Operation<HttpDurableStreamHandle>`. The resource:
  1. Creates the stream on the server (PUT) via `yield* call()`
  2. Creates a `Queue<AppendRequest>` for serializing appends
  3. Spawns a serial worker that pulls requests from the queue and
     executes HTTP POSTs one at a time via `yield* call()`
  4. Uses `withResolvers<void>()` per append so each caller waits for
     their specific HTTP POST to complete
  5. Provides the `DurableStream` handle with `readAll()` and `append()`
     as generator methods
- **Rationale:** The Queue + worker pattern is idiomatic Effection. The worker's
  lifetime is bound to the resource scope — when the scope is torn down (e.g.,
  workflow finishes), the worker is cancelled and no HTTP requests are left
  dangling. Sequence numbers are still assigned synchronously in `append()`
  (before the `yield*`), preserving FIFO ordering. The fail-fast pattern is
  preserved: `fatalError` is checked before enqueuing, and the worker also
  checks it before each POST. `withResolvers()` bridges the worker's
  completion back to the specific caller, so errors from a particular append
  are propagated to the correct caller.
- **Key primitives used:**
  - `resource()` — owns the worker scope and provides the stream handle
  - `createQueue()` — FIFO buffer between concurrent callers and the serial worker
  - `spawn()` — launches the worker inside the resource scope
  - `withResolvers()` — per-append completion signaling
  - `call()` — bridges async fetch/HTTP operations into Operations
- **Supersedes:** DEC-027's Promise chain serialization. The FIFO ordering
  guarantee and fail-fast semantics are preserved, but the mechanism is now
  fully Operation-native.
- **Consequences:** `HttpDurableStream.connect(opts)` is replaced by
  `yield* useHttpDurableStream(opts)`. The stream must be created inside an
  Effection scope. This is natural since it's always used with `durableRun`
  which requires a scope. Tests and demos updated to wrap stream creation
  inside `run()`. The `HttpDurableStreamHandle` interface extends
  `DurableStream` with the `lastOffset` property for offset tracking.

## DEC-034: ephemeral() — explicit escape hatch for non-durable Operations in Workflows

- **Date:** 2026-03-04
- **Context:** The combinators (`durableAll`, `durableRace`, `durableSpawn`)
  accepted `() => Workflow<T> | Operation<T>` as children (per DEC-021).
  The `| Operation<T>` part was a type-level loophole — users could pass
  bare Operations (containing `sleep()`, `fetch()`, etc.) as children
  whose effects wouldn't be journaled, silently breaking replay correctness.
  Charles (Effection author) identified that mixing Operations and Workflows
  should be a compilation error, with an explicit adapter analogous to
  Rust's `unsafe {}` as the only way to opt in.
- **Decision:** Introduce `ephemeral<T>(operation: Operation<T>): Workflow<T>`
  as the explicit escape hatch, and tighten combinator child signatures to
  accept only `() => Workflow<T>`.
  - **`ephemeral()`** wraps a non-durable Operation in a `DurableEffect` that
    is transparent to the journal: no Yield event written, no replay index
    entry consumed. The Operation runs via `routine.scope.run()` with full
    structured concurrency. On replay, the Operation simply re-runs.
  - **Combinator signatures** changed from `() => Workflow<T> | Operation<T>`
    to `() => Workflow<T>` for `durableAll`, `durableRace`, `durableSpawn`,
    and the internal `runDurableChild`. Each combinator self-wraps its
    infrastructure effects (useScope, spawn, all, race) in `ephemeral()`
    internally, so they return `Workflow<T>` — users never need `ephemeral()`
    for standard library combinator calls, including nested ones.
  - **`durableRun`** still accepts `() => Workflow<T> | Operation<T>` because
    it is the outermost entry point. The dangerous boundary is at the child
    level inside combinators, not at `durableRun`'s entry point.
  - **`durableEach`** wraps its infrastructure (ensure) in `ephemeral()`
    internally and returns `Workflow<Iterable<T>>`. `durableEach.next()`
    is a pure Workflow (no infrastructure effects) — it reads shared state
    from a module-level variable rather than Effection context, avoiding
    the scope isolation problem that arises when both functions are
    individually wrapped in `ephemeral()` (each gets its own child scope,
    making context invisible across them).
- **Rationale:** The primary risk is users passing bare non-durable Operations
  as children to combinators. By tightening the child signature to
  `Workflow<T>`, TypeScript rejects `Operation<T>` children at compile time.
  The `ephemeral()` adapter makes the escape explicit and auditable — every
  non-durable Operation that participates in a Workflow must go through it.
  This is analogous to Rust's `unsafe {}` blocks: the boundary is visible in
  the source code, making it easy to audit where durable guarantees are
  intentionally relaxed.
- **Implementation:** `ephemeral()` creates a `DurableEffect` with
  `description: "ephemeral"` whose `enter()` method runs the wrapped
  Operation via `routine.scope.run()`. It never calls `checkReplay()`,
  never appends to the stream, and never advances the replay cursor.
  Cancellation flows through naturally via Effection's scope hierarchy.
- **Supersedes:** DEC-021's widening of combinator child signatures.
  `durableRun`'s parameter type remains widened per DEC-021.
- **Consequences:** Since combinators self-wrap with `ephemeral()` internally,
  nested combinator usage works naturally:
  ```typescript
  yield* durableAll([
    function* () {
      const inner = yield* durableAll([...]);  // no ephemeral() needed
      return inner.join("+") as string;
    },
  ]);
  ```
  Users only need `ephemeral()` for their own non-durable Operations inside
  Workflows — standard library combinators handle it transparently.
  `durableEach` uses module-level state (safe due to single-threaded
  execution) rather than Effection context to share state between
  `durableEach()` and `durableEach.next()`.
