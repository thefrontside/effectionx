NOTE: This document is temporary. It'll be depeted once all of the versions were
resolved.

# Path-Based Dependencies Analysis

Projects that depend on other projects using explicit paths instead of versioned
registry dependencies.

## Projects with Path-Based Dependencies:

### 1. watch (`@effectionx/watch`)

- `"@effectionx/process": "../process/mod.ts"` (watch/deno.json:21)
- `"@effectionx/stream-helpers": "../stream-helpers/mod.ts"`
  (watch/deno.json:22)

### 2. process (`@effectionx/process`)

- `"@effectionx/stream-helpers": "../stream-helpers/mod.ts"`
  (process/deno.json:13)

## Notes

All other projects in the monorepo use versioned dependencies from registries
(npm: or jsr:) rather than path-based references.

---

# Effection Version Downgrades (v4 → v3)

Projects that were downgraded from Effection v4 to v3:

### 1. websocket (`@effectionx/websocket`)

- Downgraded in commit `26ea6ec` - "[websocket] Downgraded to v3 and switched to
  @effectionx/bdd"
- From: `4.0.0-beta.2` → To: `^3`

### 2. worker (`@effectionx/worker`)

- Downgraded in commit `7faf1f5` - "Downgraded worker to v3 but with failure"
- From: `4.0.0-beta.2` → To: `^3`

### 3. test-adapter (`@effectionx/test-adapter`)

- Downgraded in commits `b0840a4` and `51890db` - "Downgrade effection to 3 in
  test-adapter"
- From: `4.0.0-beta.2` → To: `^3`

### 4. timebox (`@effectionx/timebox`)

- Downgraded in commit `633cf21` - "timebox: Refactor tests to use
  @effectionx/deno-testing-bdd"
- From: `4.0.0-beta.2` → To: `^3`

### 5. watch (`@effectionx/watch`)

- Downgraded in commit `b725a62` - "watch tests are passing"
- From: `4.0.0-beta.2` → To: `3.6.0` (later changed to `^3`)
- Also downgraded in commit `bfbea7b` - "WIP"
- From: `4.0.0-alpha.6` → To: `3.1.0`

### 6. jsonl-store (`@effectionx/jsonl-store`)

- Downgraded in commit `97e937e` - "[jsonl-store] Switched to @effectionx/bdd"
- From: `4.0.0-beta.2` → To: `^3`

### 7. task-buffer (`@effectionx/task-buffer`)

- Downgraded in commit `50e072e` - "task-buffer: Refactor tests to use
  @effectionx/deno-testing-bdd"
- From: `4.0.0-beta.2` → To: `^3`

### 8. raf (`@effectionx/raf`)

- Downgraded in commit `c48921c` - "Failing test"
- From: `4.0.0-alpha.7` → To: `3.4.0` (later changed to `^3`)

## Summary

- **Total projects downgraded:** 8
- **Common target version:** `^3` (Effection v3)
- **Primary reason:** Most downgrades occurred during migration to
  `@effectionx/bdd` testing framework

---

# Published Versions on JSR

Current published versions for downgraded packages:

### 1. websocket (`@effectionx/websocket`)

- 2.0.1
- 2.0.2
- 2.1.0 (latest)

### 2. worker (`@effectionx/worker`)

- 0.1.1
- 0.1.2
- 0.2.0 (latest)

### 3. test-adapter (`@effectionx/test-adapter`)

- 0.1.1
- 0.1.2
- 0.2.0
- 0.3.0
- 0.4.0
- 0.5.0
- 0.5.1 (latest)

### 4. timebox (`@effectionx/timebox`)

- 0.1.1
- 0.1.2
- 0.2.0 (latest)

### 5. watch (`@effectionx/watch`)

- 0.1.2
- 0.1.3
- 0.2.0 (latest)

### 6. jsonl-store (`@effectionx/jsonl-store`)

- 0.1.1
- 0.1.2
- 0.2.0 (latest)

### 7. task-buffer (`@effectionx/task-buffer`)

- 1.0.2
- 1.0.3
- 1.1.0 (latest)

### 8. raf (`@effectionx/raf`)

- 1.0.0-alpha.0
- 1.0.0-alpha.1 (latest)

---

# Suggested Downgrade Versions

Versions lower than the lowest published version for each package:

1. **websocket** - Current lowest: 2.0.1 → **Suggested: 2.0.0** ✓ Not published
2. **worker** - Current lowest: 0.1.1 → **Suggested: 0.1.0** ✓ Not published
3. **test-adapter** - Current lowest: 0.1.1 → **Suggested: 0.1.0** ✓ Not
   published
4. **timebox** - Current lowest: 0.1.1 → **Suggested: 0.1.0** ✓ Not published
5. **watch** - Current lowest: 0.1.2 → **Suggested: 0.1.1** ✓ Not published
6. **jsonl-store** - Current lowest: 0.1.1 → **Suggested: 0.1.0** ✓ Not
   published
7. **task-buffer** - Current lowest: 1.0.2 → **Suggested: 1.0.1** ✓ Not
   published
8. **raf** - Current lowest: 1.0.0-alpha.0 → **Suggested: 0.0.1** ✓ Not
   published

**Verification Status:** All suggested versions confirmed to NOT exist on JSR
(verified on 2025-10-17)

---

# Dependency Updates Required

Packages that depend on downgraded packages needed their dependency versions
updated:

1. **worker** (`@effectionx/worker`)
   - Depends on: `@effectionx/timebox`
   - Updated from: `^0.2.0` → `^0.1.0`

2. **bdd** (`@effectionx/bdd`)
   - Depends on: `@effectionx/test-adapter`
   - Updated from: `^0.5.1` → `^0.1.0`
