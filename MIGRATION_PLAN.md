# Migration Plan: Deno to Node/NPM

## Overview

This document outlines the plan to migrate the effectionx monorepo from Deno to Node/NPM.

## Decisions

| Aspect | Decision |
|--------|----------|
| Runtime | Node.js with `--experimental-strip-types` |
| Build | `tsc --build` with incremental + project references |
| Lint/Format | Biome |
| Assertions | `@std/expect` (npm) |
| Publishing | NPM only (drop JSR) |
| Exports | Conditional: `development` → source, `default` → dist |
| Effection dep | `"^3 \|\| ^4.0.0-0"` as peerDependencies |
| Test files | Excluded from build, included in type check |
| `dist/` | Gitignored |
| deno-deploy | Keep but deprecate |

## Phase 1: Root Configuration

### 1.1 Update `package.json`

Add devDependencies and scripts:

```json
{
  "name": "effectionx",
  "private": true,
  "type": "module",
  "packageManager": "pnpm@9.15.9",
  "scripts": {
    "build": "tsc --build",
    "typecheck": "tsc -p tsconfig.check.json",
    "test": "node --conditions=development --experimental-strip-types --test '**/*.test.ts'",
    "lint": "biome lint .",
    "format": "biome format . --write",
    "format:check": "biome format ."
  },
  "devDependencies": {
    "@biomejs/biome": "^1",
    "@std/expect": "^1",
    "effection": "^3",
    "typescript": "^5"
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

### 1.4 Create `biome.json`

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
    "ignore": ["**/dist", "**/node_modules", "**/*.json"]
  }
}
```

### 1.5 Update `pnpm-workspace.yaml`

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

### 1.6 Update `.gitignore`

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
  "exports": {
    ".": {
      "development": "./mod.ts",
      "default": "./dist/mod.js"
    }
  },
  "types": "./dist/mod.d.ts",
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
    "node": ">= 16"
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
  "include": ["*.ts"],
  "exclude": ["*.test.ts", "dist"],
  "references": []
}
```

Add references for packages that depend on other workspace packages.

### 2.3 Remove `deno.json`

Delete after migrating configuration to package.json and tsconfig.json.

## Phase 3: Test Infrastructure

### 3.1 Update `@effectionx/bdd`

- Make `mod.node.ts` the default export
- Remove or keep `mod.deno.ts` for backwards compatibility

### 3.2 Replace test imports

In all 31 test files, update:

| Before | After |
|--------|-------|
| `import { expect } from "@std/expect"` | `import { expect } from "@std/expect"` (npm package - same API) |

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
| `watch` | `@std/fs` → `node:fs`, `@std/path` → `node:path` |
| `worker` | `@std/assert` → `node:assert`, `@std/fs` → `node:fs`, `@std/path` → `node:path` |
| `jsonl-store` | `@std/json` → native, `@std/streams` → `node:stream`, `@std/fs` → `node:fs`, `@std/path` → `node:path` |

### 4.2 Test helper files

Also update test helpers in:
- `watch/test/helpers.ts`
- `worker/worker.test.ts`

## Phase 5: Task Scripts Rewrite

### 5.1 API replacements

| Deno API | Node equivalent |
|----------|-----------------|
| `Deno.env.get()` | `process.env[]` |
| `Deno.env.has()` | `process.env[] !== undefined` |
| `Deno.readTextFile()` | `fs.promises.readFile(path, 'utf-8')` |
| `Deno.writeTextFile()` | `fs.promises.writeFile(path, content)` |
| `Deno.args` | `process.argv.slice(2)` |
| `Deno.cwd()` | `process.cwd()` |
| `Deno.chdir()` | `process.chdir()` |
| `Deno.copyFile()` | `fs.promises.copyFile()` |
| `Deno.exit()` | `process.exit()` |

### 5.2 Scripts to rewrite

| Script | Notes |
|--------|-------|
| `publish-matrix.ts` | Replace Deno APIs |
| `gather-tags.ts` | Replace Deno APIs |
| `preview-matrix.ts` | Replace Deno APIs |
| `publish-complete.ts` | Replace Deno APIs |
| `build-npm.ts` | Replace `@deno/dnt` with `tsc --build` |
| `check-version-mismatches.ts` | Replace Deno APIs |
| `update-effection-version.ts` | Replace Deno APIs |
| `lib/read-packages.ts` | Replace Deno APIs |

### 5.3 Scripts to remove

- `generate-importmap.ts` - No longer needed

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

## Verification

### After Phase 1:
```bash
pnpm install
pnpm lint
pnpm typecheck
```

### After Phase 2:
```bash
pnpm ls -r
tsc --build
```

### After Phase 3:
```bash
node --conditions=development --experimental-strip-types --test "fx/**/*.test.ts"
pnpm test
```

### Final:
- [ ] `pnpm install` succeeds
- [ ] `pnpm lint` passes
- [ ] `pnpm format:check` passes
- [ ] `pnpm typecheck` passes
- [ ] `pnpm build` succeeds
- [ ] `pnpm test` passes
- [ ] No `deno.json` files remain (except deno-deploy)
- [ ] CI workflows pass

## Future Work (Out of Scope)

- Testing against both Effection v3 and v4 using `@node-loader/import-maps`
- Per-package version matrix based on peerDependencies
