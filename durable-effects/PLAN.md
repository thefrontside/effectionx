# @effectionx/durable-effects — Implementation Plan

**Status:** In progress
**Branch:** `feat/durable-effects` (based on `main`)
**Worktree:** `~/dev/worktrees/effectionx/durable-effects`
**Spec:** `~/Downloads/effect-type-specs-3.md`

---

## Agent Recovery Prompt

> You are implementing the `@effectionx/durable-effects` package in the effectionx
> monorepo. This is a NEW package (not modifications to `durable-streams`).
>
> **What this package does:** Provides 6 durable effects (`durableExec`,
> `durableReadFile`, `durableGlob`, `durableFetch`, `durableEval`, `durableResolve`)
> plus 3 replay guards (`useFileContentGuard`, `useGlobContentGuard`,
> `useCodeFreshnessGuard`) for use in Effection durable workflows.
>
> **Key architecture decisions:**
>
> 1. **Branch from `main`**, NOT from `feat/durable-streams`.
> 2. **Consume `@effectionx/durable-streams` via preview package URL:**
>    `https://pkg.pr.new/thefrontside/effectionx/@effectionx/durable-streams@179`
>    (from PR #179). It is NOT a workspace sibling.
> 3. **Node runtime only** — `nodeRuntime()` using Node.js APIs. No Deno.
> 4. **Separate context** — `DurableRuntimeCtx` is its own Effection context,
>    NOT a field on `DurableContext`.
> 5. **`useFileContentGuard` moves entirely** from `durable-streams` to this
>    package (in a follow-up PR #2; this PR creates the new version here).
> 6. **Web Crypto API** for `computeSHA256` (portable, Node 22+).
> 7. **Do NOT modify `durableRun`** — callers install runtime context manually
>    via `scope.set(DurableRuntimeCtx, nodeRuntime())` before calling `durableRun`.
> 8. **Colocated test files** — `*.test.ts` at package root (effectionx convention).
> 9. **Effection alpha override** — needs `"effection": "4.1.0-alpha.7"` in
>    `pnpm.overrides` for `effection/experimental` compatibility.
> 10. **Commit after every step** — each implementation step gets its own commit.
>
> **What to import from `@effectionx/durable-streams`:**
> `createDurableOperation`, `DurableEffect`, `Workflow`, `Json`, `WorkflowValue`,
> `EffectDescription`, `Result`, `ReplayGuard`, `ReplayOutcome`, `StaleInputError`,
> `durableRun`, `InMemoryStream`, `DurableEvent`, `Yield`.
>
> **What to import from `effection`:**
> `createContext`, `useScope`, `call`, `action`, `Operation`, `Context`, `Scope`.
>
> **Test pattern:** Use `@effectionx/bdd` (`describe`, `it`), `expect` from
> `expect`, `InMemoryStream` from `@effectionx/durable-streams`, and
> `stubRuntime()` for isolation. Install runtime context manually in tests:
> ```typescript
> const scope = yield* useScope();
> scope.set(DurableRuntimeCtx, stubRuntime({ /* overrides */ }));
> yield* durableRun(workflow, { stream });
> ```
>
> **Inside `createDurableOperation` callbacks**, access runtime via:
> ```typescript
> function* () {
>   const scope = yield* useScope();
>   const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);
>   // ... use runtime methods ...
> }
> ```
>
> **Spec file** is at `~/Downloads/effect-type-specs-3.md`. Read it for
> detailed signatures, implementation code, and test requirements.
>
> **This file (PLAN.md)** tracks progress. Check the checklist below to see
> what's done and what's next. Mark items as you complete them.

---

## Architecture

```
durable-effects/                   # NEW package at repo root
├── PLAN.md                        # This file — plan + progress tracker
├── mod.ts                         # Public API barrel
├── package.json                   # @effectionx/durable-effects
├── tsconfig.json                  # Extends root, references bdd
├── README.md                      # Package documentation
│
├── runtime.ts                     # DurableRuntime interface + DurableRuntimeCtx
├── node-runtime.ts                # nodeRuntime() — Node.js implementation
├── stub-runtime.ts                # stubRuntime() — test helper
├── hash.ts                        # computeSHA256() — Web Crypto API
│
├── operations.ts                  # 6 durable effects
├── guards.ts                      # 3 replay guards
│
├── hash.test.ts                   # Tests for computeSHA256
├── operations.test.ts             # Tests for all 6 effects
├── guards.test.ts                 # Tests for all 3 guards
└── node-runtime.test.ts           # Tests for nodeRuntime()
```

### Dependency Graph

```
@effectionx/durable-effects
  ├── dependencies
  │   └── @effectionx/durable-streams (preview URL from PR #179)
  ├── peerDependencies
  │   └── effection: "^3 || ^4"
  └── devDependencies
      ├── @effectionx/bdd: "workspace:*"
      ├── effection: "^4"
      └── expect: "^29"
```

### Effects Summary

| Effect           | Type          | Runtime methods used                          |
|------------------|---------------|-----------------------------------------------|
| `durableExec`    | `"exec"`      | `runtime.exec()`                              |
| `durableReadFile`| `"read_file"` | `runtime.readTextFile()`                      |
| `durableGlob`    | `"glob"`      | `runtime.glob()`, `runtime.readTextFile()`    |
| `durableFetch`   | `"fetch"`     | `runtime.fetch()`                             |
| `durableEval`    | `"eval"`      | none (caller-provided evaluator)              |
| `durableResolve` | `"resolve"`   | `runtime.env()`, `runtime.platform()`         |

### Guards Summary

| Guard                    | Works with       | Detects                                    |
|--------------------------|------------------|--------------------------------------------|
| `useFileContentGuard`    | `durableReadFile`| File content changed since journal recorded|
| `useGlobContentGuard`    | `durableGlob`    | Files added/removed/modified in scan       |
| `useCodeFreshnessGuard`  | `durableEval`    | Source or bindings changed for eval cell   |

---

## Implementation Checklist

Mark each step done as you complete it. Commit after every step.

- [x] **Step 0:** Create worktree + branch from main
- [ ] **Step 0.5:** Write PLAN.md, scaffold package, integrate into monorepo, pnpm install
- [ ] **Step 1:** `runtime.ts` — DurableRuntime interface + DurableRuntimeCtx
- [ ] **Step 2:** `hash.ts` — computeSHA256 using Web Crypto + `hash.test.ts`
- [ ] **Step 3:** `stub-runtime.ts` — test stub runtime
- [ ] **Step 4:** `node-runtime.ts` — nodeRuntime() + `node-runtime.test.ts`
- [ ] **Step 5:** `operations.ts` — All 6 effects (durableResolve, durableReadFile, durableExec, durableFetch, durableGlob, durableEval) + `operations.test.ts`
- [ ] **Step 6:** `guards.ts` — All 3 replay guards + `guards.test.ts`
- [ ] **Step 7:** `mod.ts` — Complete public API barrel exports
- [ ] **Step 8:** Verify build, lint, all tests pass
- [ ] **Step 9:** Create PR

---

## PR Sequence

**PR 1 (this work):** `feat/durable-effects`
- New `@effectionx/durable-effects` package with all effects, guards, runtime
- Consumes `@effectionx/durable-streams` via preview URL
- Self-contained, no changes to `durable-streams`

**PR 2 (follow-up, after durable-streams merges):**
- Move `DurableRuntime` interface + `DurableRuntimeCtx` into `durable-streams`
- Add `runtime?: DurableRuntime` to `DurableRunOptions`
- Wire runtime context installation into `durableRun()`
- Remove `file-guard.ts` and `useFileContentGuard` from `durable-streams`
- Switch dependency from preview URL to `workspace:*`

---

## Notes

- The spec file (`~/Downloads/effect-type-specs-3.md`) was written for Deno.
  Adapt all implementations to Node.js APIs.
- `effection/experimental` requires alpha (`4.1.0-alpha.7`). The root
  `package.json` needs `pnpm.overrides` for this.
- `DurableRuntime.fetch()` returns an object with a minimal headers interface
  (`{ get(key: string): string | null }`) to avoid requiring DOM lib types.
- `durableResolve` uses `as T` casts — pragmatic, safe at runtime given
  `T extends Json` constraint.
