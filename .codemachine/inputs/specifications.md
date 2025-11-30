# Project Specifications: Node.js Test Runner for effection-x

## 1.0 Project Overview

**Project Name:** Node.js Test Runner Integration for effection-x

**Project Goal:** Introduce a new way of testing effection-x packages with Node.js without compiling TypeScript, to eliminate test flakiness caused by Deno's Node compatibility layer while maintaining the ability to run tests in multiple runtimes.

**Target Audience:** effection-x package maintainers and contributors

**Status:** ✅ Implemented

---

## 2.0 Problem Statement

### Current State
- All 15 effection-x packages use `@effectionx/bdd` for testing, which relies on `@effectionx/test-adapter`
- Tests currently run via `deno test -A`
- Deno's Node compatibility layer is causing test flakiness
- Tests need to run against both Effection v3 and v4 using import maps

### Desired State
- Tests run primarily on Node.js for stability
- Same test files work across Node (primary), Deno, and Bun (secondary)
- No TypeScript compilation step required
- Ability to swap Effection versions via import maps or equivalent mechanism

---

## 3.0 Requirements

### 3.1 Runtime Strategy

| Priority | Runtime | Status |
|----------|---------|--------|
| Primary | Node.js | ✅ Implemented |
| Secondary | Deno | ✅ Maintained |
| Secondary | Bun | MAY support in future |

### 3.2 Core Functionality

1. **Runtime Adapter Layer**
   - Location: `@effectionx/bdd`
   - ✅ Uses conditional exports to provide runtime-specific implementations
   - ✅ `mod.node.ts` uses `node:test`
   - ✅ `mod.deno.ts` uses `@std/testing/bdd`
   - ✅ Shared logic in `bdd.ts` via `createBDD()` factory

2. **Test Runner**
   - ✅ Uses Node's built-in test runner (`node --test`)
   - ✅ Supports existing `describe`/`it` test syntax from `@effectionx/bdd`

3. **TypeScript Execution**
   - ✅ Node 22+ native TypeScript support (`--experimental-strip-types`)
   - `tsx` available as fallback (installed in root devDependencies)

4. **Import Resolution**
   - ✅ `deno install` populates `node_modules` from both JSR and npm
   - ✅ `.npmrc` with `@jsr:registry=https://npm.jsr.io` for JSR compatibility
   - ✅ JSR packages translated to `npm:@jsr/scope__package@version` format
   - ⏳ Version switching (v3 vs v4) - pending implementation

### 3.3 Package Scope

**Included packages (14):** ✅ All implemented
- context-api, bdd, jsonl-store, fx, raf, task-buffer, test-adapter
- timebox, tinyexec, watch, websocket, worker, stream-helpers, signals, process

**Excluded packages (1):**
- deno-deploy (Deno-specific, not applicable)

### 3.4 Test File Strategy

- ✅ Same test files for all runtimes
- ✅ No separate Node-specific test files
- ✅ Adapter mechanism handles runtime differences via conditional exports

---

## 4.0 Implementation Details

### 4.1 Package Structure

Each package has:
- `deno.json` - Deno configuration with JSR/npm imports
- `package.json` - Node configuration with translated dependencies

Root workspace:
- `package.json` - Workspace configuration with all 14 packages
- `.npmrc` - JSR registry configuration
- Hoisted `expect` and `tsx` in root devDependencies

### 4.2 Dependency Translation

| Deno (deno.json) | Node (package.json) |
|------------------|---------------------|
| `npm:effection@^3` | `"effection": "^3"` |
| `jsr:@std/expect@^1` | Replaced with `npm:expect@^29` |
| `jsr:@effectionx/bdd@0.2.2` | `"@effectionx/bdd": "workspace:*"` |
| `npm:@effectionx/signals@0.3.0` | `"@effectionx/signals": "workspace:*"` |

### 4.3 BDD Adapter Architecture

```
bdd/
├── bdd.ts           # Shared logic (createBDD factory)
├── mod.node.ts      # Node entrypoint → imports from node:test
├── mod.deno.ts      # Deno entrypoint → imports from @std/testing/bdd
├── deno.json        # Deno exports: ./mod.deno.ts
└── package.json     # Node conditional exports: { "node": "./mod.node.ts" }
```

### 4.4 Test Execution Commands

```bash
# Node (primary)
node --experimental-strip-types --test <file>

# Node with tsx fallback
npx tsx --test <file>

# Deno (secondary)
deno test -A <file>
```

---

## 5.0 Success Criteria

| Criteria | Status |
|----------|--------|
| All 14 packages can run tests via `node --test` | ✅ |
| Tests are stable (no flakiness) | 🔄 To be validated |
| Same test files run in both Node and Deno | ✅ |
| Effection v3 and v4 version switching | ⏳ Pending |
| No TypeScript build/compile step | ✅ |

---

## 6.0 Resolved Design Decisions

### 6.1 Package Manager Choice
**Decision:** Use Deno as package manager
- `deno install` populates `node_modules` for both JSR and npm packages
- Faster than npm (15-90% faster)
- Single source of truth in `deno.json`

### 6.2 Import Map Equivalent
**Decision:** Pending
- Deno uses `--import-map` flag
- Node equivalent needed for v3/v4 switching
- Options: Node's experimental import maps, custom loader, or package.json overrides

### 6.3 Adapter Architecture
**Decision:** Conditional exports in package.json
- `mod.node.ts` and `mod.deno.ts` as separate entrypoints
- Shared logic extracted to `bdd.ts` with `createBDD()` factory
- Node resolves to `mod.node.ts`, Deno resolves to `mod.deno.ts`

### 6.4 Assertion Library
**Decision:** Replace `@std/expect` with `npm:expect`
- `npm:expect` (Jest's expect) works in both Deno and Node
- Same API, cross-runtime compatible
- Avoids `@std/expect` cleanup issues in Node

---

## 7.0 Open Items

1. **Import Maps for v3/v4 Switching**
   - Need Node equivalent of Deno's `--import-map` flag
   - Consider: Node's `--experimental-import-maps`, custom loader, or package.json overrides

2. **CI Integration**
   - Add Node test runner to CI pipeline
   - Determine if Deno CI should be maintained in parallel

3. **Performance Benchmarks**
   - Initial observation: Node ~132ms, Deno ~19ms for same tests
   - Full benchmark across all packages needed
