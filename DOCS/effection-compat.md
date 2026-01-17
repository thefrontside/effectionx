# Effection Compatibility Test Runner

This document describes the workflow for testing packages against the minimum and maximum Effection versions declared by each package's `peerDependencies`.

## Goals

- Run tests for each package at the **lowest** and **highest** Effection versions supported by its peer range.
- Prefer **stable** max versions when available; only use prerelease if no stable satisfies.
- Group packages by version to minimize install cycles.
- Use Turbo `--filter` flags to only test relevant packages per version group.

## Usage

```bash
pnpm test:effection
```

## How It Works

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                     Effection Compatibility Test Runner                     │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  1. RESOLVE VERSION GROUPS                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  Read pnpm-workspace.yaml                                              │ │
│  │       │                                                                │ │
│  │       ▼                                                                │ │
│  │  For each package:                                                     │ │
│  │    • Read package.json → peerDependencies.effection                    │ │
│  │    • Fetch all effection versions from npm                             │ │
│  │    • Resolve min (semver.minVersion) and max (semver.maxSatisfying)    │ │
│  │       │                                                                │ │
│  │       ▼                                                                │ │
│  │  Group packages by version:                                            │ │
│  │    version 3.0.0 → [pkg-a, pkg-b, pkg-c, ...]                          │ │
│  │    version 4.0.0 → [pkg-a, pkg-b, pkg-c, ...]                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  2. FOR EACH VERSION GROUP                                                  │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │                         ┌──────────────────┐                           │ │
│  │                         │ Version: 3.0.0   │                           │ │
│  │                         │ Packages: [...]  │                           │ │
│  │                         └────────┬─────────┘                           │ │
│  │                                  │                                     │ │
│  │    ┌─────────────────────────────┼─────────────────────────────┐       │ │
│  │    │                             ▼                             │       │ │
│  │    │  [1/3] Set pnpm override                                  │       │ │
│  │    │        pnpm config set pnpm.overrides.effection=3.0.0     │       │ │
│  │    │                             │                             │       │ │
│  │    │                             ▼                             │       │ │
│  │    │  [2/3] Install dependencies                               │       │ │
│  │    │        pnpm install --no-frozen-lockfile                  │       │ │
│  │    │                             │                             │       │ │
│  │    │                             ▼                             │       │ │
│  │    │  [3/3] Run tests with Turbo filters                       │       │ │
│  │    │        pnpm turbo run test --filter=pkg-a --filter=pkg-b  │       │ │
│  │    └─────────────────────────────┬─────────────────────────────┘       │ │
│  │                                  │                                     │ │
│  │                                  ▼                                     │ │
│  │                         ┌──────────────────┐                           │ │
│  │                         │ Version: 4.0.0   │                           │ │
│  │                         │ Packages: [...]  │                           │ │
│  │                         └────────┬─────────┘                           │ │
│  │                                  │                                     │ │
│  │                            (repeat...)                                 │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
                                      │
                                      ▼
┌─────────────────────────────────────────────────────────────────────────────┐
│  3. CLEANUP                                                                 │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │  • Remove .npmrc (created by pnpm config set)                          │ │
│  │  • Reinstall with original lockfile                                    │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Version Resolution

For each package with an `effection` peer dependency (e.g., `^3 || ^4.0.0-0`):

1. **min version**: `semver.minVersion(range)` → `3.0.0`
2. **max version**: `semver.maxSatisfying(versions, range)` with stable preference → `4.0.0`

### Version Groups

Packages are grouped by which versions they support. For example:

| Package | Peer Range | Min | Max |
|---------|------------|-----|-----|
| @effectionx/process | `^3 \|\| ^4.0.0-0` | 3.0.0 | 4.0.0 |
| @effectionx/signals | `^3 \|\| ^4.0.0-0` | 3.0.0 | 4.0.0 |

This produces two version groups:
- **3.0.0**: all packages supporting 3.x
- **4.0.0**: all packages supporting 4.x

### Execution Flow

For each version group:

1. Set pnpm override: `pnpm config set --location project pnpm.overrides.effection=<version>`
2. Install dependencies: `pnpm install --no-frozen-lockfile`
3. Run tests with filters: `pnpm turbo run test --filter=@effectionx/pkg1 --filter=@effectionx/pkg2 ...`

After all groups complete:

4. Remove `.npmrc` (created by pnpm config set)
5. Reinstall: `pnpm install --no-frozen-lockfile`

## Configuration

### Turbo Config (`turbo.json`)

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "outputs": ["dist/**", "*.tsbuildinfo"]
    },
    "lint": {
      "outputs": []
    },
    "check": {
      "outputs": []
    },
    "test": {
      "dependsOn": ["^check"],
      "outputs": [],
      "cache": false
    }
  }
}
```

Note: `cache: false` on `test` prevents cross-version caching artifacts.

### Root Script (`package.json`)

```json
{
  "scripts": {
    "test:effection": "node --env-file=.env .internal/effection-compat.ts"
  }
}
```

### Runner Dependencies (`.internal/package.json`)

```json
{
  "dependencies": {
    "@effectionx/fs": "workspace:*",
    "@effectionx/process": "workspace:*",
    "effection": "^3 || ^4.0.0-0",
    "semver": "^7.7.2"
  }
}
```

## Example Output

```
Effection Compatibility Test Runner
====================================

Resolving version groups...
Fetching effection versions from npm...
  @effectionx/bdd: min=3.0.0, max=4.0.0
  @effectionx/chain: min=3.0.0, max=4.0.0
  @effectionx/process: min=3.0.0, max=4.0.0
  ...

Will test against 2 Effection versions: 3.0.0, 4.0.0

============================================================
Testing with Effection 3.0.0
Packages: @effectionx/bdd, @effectionx/chain, @effectionx/process, ...
============================================================

[1/3] Setting override to effection@3.0.0...
[2/3] Installing dependencies...
[3/3] Running tests...

 Completed tests for Effection 3.0.0

============================================================
Testing with Effection 4.0.0
Packages: @effectionx/bdd, @effectionx/chain, @effectionx/process, ...
============================================================

[1/3] Setting override to effection@4.0.0...
[2/3] Installing dependencies...
[3/3] Running tests...

 Completed tests for Effection 4.0.0

============================================================
Cleaning up...
============================================================

 All compatibility tests complete!
```

## CI Integration

### Workflow: `.github/workflows/effection-compat.yaml`

```yaml
name: Effection Compatibility

on:
  workflow_call:
  pull_request:
    branches: [main]
  schedule:
    - cron: '0 6 * * 1'  # Weekly on Monday at 6am UTC

jobs:
  compat:
    name: Effection Compatibility
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: pnpm/action-setup@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 22
          cache: pnpm

      - run: pnpm install --frozen-lockfile

      - name: Run compatibility tests
        run: pnpm test:effection
```

### Notes

- **Non-frozen lockfile**: The runner uses `--no-frozen-lockfile` internally because it swaps Effection versions via pnpm overrides.
- **Single OS**: No need for OS matrix; version compatibility is OS-agnostic.
- **Separate from verify**: Compatibility tests run independently so regular tests remain fast.

## Design Decisions

### Why pnpm overrides?

Using `pnpm.overrides` in `.npmrc` (via `pnpm config set --location project`) allows swapping versions without modifying `package.json` files or maintaining multiple lockfiles.

### Why Turbo filters?

When packages have different peer ranges, each version group may include different packages. Turbo's `--filter` flag ensures only relevant packages are tested for each version.

### Why no per-version lockfiles?

Multiple lockfiles are high-maintenance and would require keeping them in sync across the workspace. The override approach is simpler and works well for compatibility testing.

### Why cache: false?

Turbo's cache could serve stale results across version groups. Disabling cache for `test` ensures each version group runs fresh tests.
