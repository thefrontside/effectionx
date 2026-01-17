# Migration Plan: Deno to Node/NPM

## Overview

This document outlines the plan to migrate the effectionx monorepo from Deno to Node/NPM.

## Decisions

| Aspect | Decision |
|--------|----------|
| Runtime | Node.js with `--experimental-strip-types` |
| Build | `tsc --build` with incremental + project references |
| Lint/Format | Biome (including JSON files) |
| Assertions | `expect` (Jest's expect package from npm) |
| Publishing | NPM only (drop JSR) |
| Exports | Conditional: `development` → source, `default` → dist |
| Effection dep | `"^3 \|\| ^4.0.0-0"` as peerDependencies |
| Test files | Excluded from build, included in type check |
| `dist/` | Gitignored |
| deno-deploy | Keep but deprecate |
| Engines | `>= 22` (required for `--experimental-strip-types`) |
| Peer deps | Strict enforcement via pnpm config |
| Legacy compat | Add `main`/`types` fields alongside `exports` |

## Phase 1: Root Configuration

### 1.1 Update `package.json`

Add devDependencies, scripts, and pnpm peer dependency rules:

```json
{
  "name": "effectionx",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.9",
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc -p tsconfig.check.json",
    "test": "node --conditions=development --experimental-strip-types --test \"**/*.test.ts\"",
    "lint": "biome lint .",
    "format": "biome format . --write",
    "format:check": "biome format .",
    "sync": "node --experimental-strip-types tasks/sync-tsrefs.ts",
    "sync:fix": "node --experimental-strip-types tasks/sync-tsrefs.ts fix",
    "check:tsrefs": "node --experimental-strip-types tasks/sync-tsrefs.ts check"
  },
  "devDependencies": {
    "@biomejs/biome": "^1",
    "effection": "^3",
    "expect": "^29",
    "typescript": "^5"
  },
  "pnpm": {
    "peerDependencyRules": {
      "ignoreMissing": [],
      "allowAny": []
    }
  },
  "volta": {
    "node": "22.12.0",
    "pnpm": "9.15.9"
  }
}
```

### 1.2 Create `tsconfig.json`

Root config for building packages with incremental compilation:

```json
{
  "compilerOptions": {
    "composite": true,
    "incremental": true,
    "declaration": true,
    "declarationMap": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "strict": true,
    "skipLibCheck": true
  },
  "references": [
    { "path": "bdd" },
    { "path": "chain" },
    { "path": "context-api" },
    { "path": "deno-deploy" },
    { "path": "fx" },
    { "path": "jsonl-store" },
    { "path": "process" },
    { "path": "raf" },
    { "path": "signals" },
    { "path": "stream-helpers" },
    { "path": "task-buffer" },
    { "path": "test-adapter" },
    { "path": "timebox" },
    { "path": "tinyexec" },
    { "path": "watch" },
    { "path": "websocket" },
    { "path": "worker" }
  ]
}
```

### 1.3 Create `tsconfig.check.json`

For type checking everything including tests:

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    "composite": false,
    "incremental": false
  },
  "include": ["**/*.ts"],
  "exclude": ["**/dist", "**/node_modules"]
}
```

### 1.4 Create root `tsconfig.test.json`

Create `tsconfig.test.json` at the repository root. This file defines which files are considered test files. The `sync-tsrefs.ts` script uses this as the default fallback to distinguish test-only imports from runtime imports.

**Location:** `/tsconfig.test.json` (repository root)

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true
  },
  "include": ["**/*.test.ts", "**/test/**/*.ts"],
  "exclude": ["**/dist", "**/node_modules"]
}
```

> **Required:** This root `tsconfig.test.json` is required for `sync-tsrefs.ts` to correctly classify imports. Without it, all imports are treated as runtime dependencies.

### 1.5 Create `biome.json`

```json
{
  "$schema": "https://biomejs.dev/schemas/1.9.4/schema.json",
  "organizeImports": {
    "enabled": true
  },
  "linter": {
    "enabled": true,
    "rules": {
      "recommended": true,
      "style": {
        "noParameterAssign": "off",
        "useConst": "off"
      },
      "correctness": {
        "useYield": "off"
      }
    }
  },
  "formatter": {
    "enabled": true,
    "indentStyle": "space",
    "indentWidth": 2
  },
  "files": {
    "ignore": ["**/dist", "**/node_modules"]
  }
}
```

> **Note:** Biome is configured to include JSON files by default, so do not add `**/*.json` to the ignore list.

### 1.6 Update `pnpm-workspace.yaml`

Add all 17 packages:

```yaml
packages:
  - "bdd"
  - "chain"
  - "context-api"
  - "deno-deploy"
  - "fx"
  - "jsonl-store"
  - "process"
  - "raf"
  - "signals"
  - "stream-helpers"
  - "task-buffer"
  - "test-adapter"
  - "timebox"
  - "tinyexec"
  - "watch"
  - "websocket"
  - "worker"
```

> **Note:** The `pnpm-workspace.yaml` must use explicit package paths, not globs (e.g., `packages/*`). The `sync-tsrefs.ts` script requires explicit entries and will error if globs are used.

### 1.7 Update `.gitignore`

Add:

```
dist/
*.tsbuildinfo
```

## Phase 2: Per-Package Migration (17 packages)

For each package, create/update:

### 2.1 `package.json` template

```json
{
  "name": "@effectionx/<name>",
  "version": "<from deno.json>",
  "type": "module",
  "main": "./dist/mod.js",
  "types": "./dist/mod.d.ts",
  "exports": {
    ".": {
      "development": "./mod.ts",
      "default": "./dist/mod.js"
    }
  },
  "peerDependencies": {
    "effection": "^3 || ^4.0.0-0"
  },
  "license": "MIT",
  "author": "engineering@frontside.com",
  "repository": {
    "type": "git",
    "url": "git+https://github.com/thefrontside/effectionx.git"
  },
  "bugs": {
    "url": "https://github.com/thefrontside/effectionx/issues"
  },
  "engines": {
    "node": ">= 22"
  },
  "sideEffects": false
}
```

Note: Packages with multiple exports (check each `deno.json`) need all exports mapped with development/default conditions.

### 2.2 `tsconfig.json` template

```json
{
  "extends": "../tsconfig.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "."
  },
  "include": ["**/*.ts"],
  "exclude": ["**/*.test.ts", "dist"],
  "references": []
}
```

Start with empty `references: []`. These will be auto-populated in step 2.4.

### 2.3 Remove `deno.json`

Delete after migrating configuration to package.json and tsconfig.json.

### 2.4 Sync tsconfig references and dependencies

After creating all package `tsconfig.json` and `package.json` files, run:

```bash
pnpm sync:fix
```

The `sync-tsrefs.ts` script has three subcommand modes:

| Command | Description |
|---------|-------------|
| `pnpm sync` | Updates tsconfig `references` only (default) |
| `pnpm sync:fix` | Updates references and adds missing workspace deps to package.json |
| `pnpm check:tsrefs` | Fails if references or deps are out of date (for CI) |

The script:
- Scans all TypeScript files (including nested directories) for workspace package imports
- Determines if a file is a test file by checking if it matches the `include` patterns in `tsconfig.test.json` (and is not excluded by `exclude` patterns). The script looks for the nearest `tsconfig.test.json` walking up from the file, falling back to the root `tsconfig.test.json`
- Classifies imports based on file type:
  - **Test-only imports** (only used in test files) → added to `devDependencies` with "workspace:*"
  - **Runtime imports** (used in non-test files) → added to `dependencies` with "workspace:*" (or left in `peerDependencies` if already declared there)
- Generates the correct `references` array in each package's `tsconfig.json` for `tsc --build`
- Skips packages without a `tsconfig.json` (warns but continues)
- Uses the root `tsconfig.test.json` when no nearer test config exists


> **Important:** 
> - Each package's `tsconfig.json` must be created before running `sync`
> - The root `tsconfig.test.json` must exist for correct test file classification
> - Run `pnpm sync:fix` to auto-update both references and package.json dependencies

## Phase 3: Test Infrastructure

### 3.1 Update `@effectionx/bdd`

- Make `mod.node.ts` the default export
- Remove or keep `mod.deno.ts` for backwards compatibility

### 3.2 Replace test imports

In all 31 test files, update:

| Before | After |
|--------|-------|
| `import { expect } from "@std/expect"` | `import { expect } from "expect"` |

The `expect` package from npm (Jest's expect) has the same API as `@std/expect`.

### 3.3 Replace `@std/testing/mock`

File: `stream-helpers/valve.test.ts`

Replace with `node:test` mock utilities.

### 3.4 Replace `@std/testing/time`

File: `task-buffer/task-buffer.test.ts`

Replace `FakeTime` with alternative (e.g., `@sinonjs/fake-timers` or custom).

## Phase 4: Source Code Stdlib Replacements

### 4.1 Packages affected

| Package | Imports to replace |
|---------|-------------------|
| `watch` | `@std/fs` → `@effectionx/fs`, `@std/path` → `node:path` |
| `worker` | `@std/assert` → `node:assert`, `@std/fs` → `@effectionx/fs`, `@std/path` → `node:path`, `fromFileUrl` → `node:url` |
| `jsonl-store` | `@std/json` → native, `@std/streams` → `node:stream`, `@std/fs` → `@effectionx/fs`, `@std/path` → `node:path`, `fromFileUrl`/`toFileUrl` → `node:url` |

### 4.2 Test helper files

Also update test helpers in:
- `watch/test/helpers.ts`
- `worker/worker.test.ts`

### 4.3 Create `@effectionx/fs`

Create `@effectionx/fs` to replace `@std/fs` utilities that don't have direct Node.js equivalents:

- `ensureDir` - create directory recursively if not exists
- `exists` - check if path exists
- `emptyDir` - remove all contents of a directory
- `walk` - recursively iterate directory entries

These should be effection Operations where appropriate.

### 4.4 Update JSDoc examples

File: `jsonl-store/jsonl.ts`

Replace `jsr:` and `npm:` specifiers in documentation examples with standard npm package names:

| Before | After |
|--------|-------|
| `jsr:@effectionx/jsonl-store` | `@effectionx/jsonl-store` |
| `npm:effection@^3` | `effection` |

## Phase 5: Task Scripts Rewrite

Task scripts have been moved from `tasks/` to `.internal/` for clearer naming as internal repo tooling.

### 5.1 API replacements

| Deno API | Node equivalent |
|----------|-----------------|
| `Deno.env.get()` | `@effectionx/process` env helper |
| `Deno.env.has()` | `@effectionx/process` env helper |
| `Deno.readTextFile()` | `@effectionx/fs` readTextFile |
| `Deno.writeTextFile()` | `@effectionx/fs` writeTextFile |
| `Deno.args` | `@effectionx/process` args helper |
| `Deno.cwd()` | `@effectionx/process` cwd helper |
| `Deno.chdir()` | `@effectionx/process` chdir helper |
| `Deno.copyFile()` | `@effectionx/fs` copyFile |
| `Deno.exit()` | `@effectionx/process` exit helper |

### 5.2 Scripts migrated to `.internal/`

| Script | Status | Notes |
|--------|--------|-------|
| `publish-matrix.ts` | ✅ Migrated | Uses `@effectionx/tinyexec`, `@effectionx/process` |
| `gather-tags.ts` | ✅ Migrated | Uses `@effectionx/process`, `@effectionx/fs` |
| `preview-matrix.ts` | ✅ Migrated | Uses `@effectionx/tinyexec`, `@effectionx/process` |
| `publish-complete.ts` | ✅ Migrated | Uses `@effectionx/process` |
| `lib/read-packages.ts` | ✅ Migrated | Reads `pnpm-workspace.yaml` + `package.json` |
| `sync-tsrefs.ts` | ✅ Migrated | Already Node.js compatible |

### 5.3 Scripts removed

| Script | Reason |
|--------|--------|
| `generate-importmap.ts` | Was for Deno import maps, no longer needed |
| `build-npm.ts` | Used `@deno/dnt`, now using `tsc --build` |
| `check-version-mismatches.ts` | Checked `deno.json` versions, no longer needed |
| `update-effection-version.ts` | Updated `deno.json` versions, no longer needed |

### 5.4 `.internal/` package setup

The `.internal/` directory is a private workspace package with its own `package.json`:

```json
{
  "name": "@effectionx/internal",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "dependencies": {
    "effection": "^3",
    "zod": "^3",
    "@effectionx/tinyexec": "workspace:*"
  }
}
```

> **Note:** All task scripts use `node --experimental-strip-types` for consistency. The scripts are plain TypeScript without TS-only syntax (no enums, namespaces, etc.), so they work with Node's type stripping.

## Phase 6: CI Workflow Migration

### 6.1 Consolidate verify workflows

Replace `verify-posix.yaml`, `verify-windows.yaml`, `verify-node.yaml` with single `verify.yaml`:

```yaml
name: Verify

on:
  workflow_call:
  pull_request:
    branches:
      - main

permissions:
  contents: read

jobs:
  test:
    strategy:
      matrix:
        os: [ubuntu-latest, macos-latest, windows-latest]
    runs-on: ${{ matrix.os }}

    steps:
      - name: checkout
        uses: actions/checkout@v4

      - name: setup pnpm
        uses: pnpm/action-setup@v4

      - name: setup node
        uses: actions/setup-node@v4
        with:
          node-version: 22

      - name: install dependencies
        run: pnpm install --frozen-lockfile

      - name: check tsconfig references
        run: pnpm check:tsrefs

      - name: lint
        run: pnpm lint

      - name: format check
        run: pnpm format:check

      - name: typecheck
        run: pnpm typecheck

      - name: build
        run: pnpm build

      - name: test
        run: pnpm test
```

### 6.2 Update `publish.yaml`

- Remove JSR publishing jobs
- Replace `deno run -A tasks/build-npm.ts` with `pnpm build`
- Keep npm publish logic

### 6.3 Update `preview.yaml`

- Replace Deno commands with Node/pnpm equivalents

## Phase 7: Special Package Handling

### 7.1 `@effectionx/deno-deploy`

- Add deprecation notice to README
- Keep in repo but consider excluding from active development

## Phase 8: Cleanup

### 8.1 Remove Deno artifacts

- Remove root `deno.json`
- Remove `v3.importmap.json`, `v4.importmap.json` (if present)
- Remove any `deno.lock` files

### 8.2 Update documentation

- Update root README with new development instructions
- Update CONTRIBUTING.md if present

## Migration Status

### Completed

| Phase | Status | Notes |
|-------|--------|-------|
| Phase 1: Root Configuration | ✅ Complete | package.json, tsconfig.json, biome.json, pnpm-workspace.yaml |
| Phase 2: Per-Package Migration | ✅ Complete | All 17 packages migrated with package.json and tsconfig.json |
| Phase 3: Test Infrastructure | ✅ Complete | BDD package updated, expect imports replaced |
| Phase 4: Source Code Stdlib Replacements | ✅ Complete | Created @effectionx/fs and @effectionx/event-emitter packages |
| Phase 5: Task Scripts Rewrite | ✅ Complete | Moved to `.internal/`, refactored to Node.js APIs |
| Phase 6: CI Workflow Migration | ✅ Complete | Single verify workflow, NPM-only publishing |
| Phase 7: Special Package Handling | ✅ Complete | deno-deploy kept with its deno.json |
| Phase 8: Cleanup | ✅ Complete | README updated, deno.json files removed |

### Test Results

| Metric | Count |
|--------|-------|
| **Passing** | 145 |
| **Skipped** | 6 |
| **Failing** | 0 |

### Resolved Issues

**Daemon Test Fix** (commit 8781338)

The daemon tests were initially failing due to:
1. Still using `deno run` instead of `node --experimental-strip-types`
2. The `expectMatch()` helper used `filter()` which caused hangs waiting for pattern matches
3. Port 29000 conflicted with exec tests running in parallel

**Fix:** Updated daemon tests to use Node.js, rewrote `expectMatch()` to directly iterate the stream and return on first match, and changed to ports 29001/29002 to avoid conflicts.

### Verification Checklist

- [x] `pnpm install` succeeds
- [x] `pnpm check:tsrefs` passes
- [x] `pnpm lint` passes
- [x] `pnpm format:check` passes
- [x] `pnpm typecheck` passes
- [x] `pnpm build` succeeds
- [x] `pnpm test` passes (145 tests)
- [x] No `deno.json` files remain (except deno-deploy)
- [x] CI workflows updated

## Future Work (Out of Scope)

- Testing against both Effection v3 and v4 using `@node-loader/import-maps`
- Per-package version matrix based on peerDependencies
