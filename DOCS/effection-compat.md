# Effection Compatibility Test Runner

This document describes the local workflow for running the test suite against the minimum and maximum Effection versions declared by each package. It includes implementation sketches with code snippets for review.

## Goals

- Run tests for each package at the **lowest** and **highest stable** Effection versions supported by its peer range.
- Prefer **stable** max versions when available; only use prerelease if no stable satisfies.
- Support local usage for **one**, **many**, or **all** packages.
- Support **watch** for a **one**, **many**, or **all** packages.
- Avoid committing multiple lockfiles; allow non-frozen installs for the compatibility runner.

## Definitions

- **min version**: `semver.minVersion(range)`
- **max version**: `semver.maxSatisfying(versions, range, { includePrerelease: false })`, with prerelease fallback if null.

---

## Turbo Version Groups (Generated Config)

This approach groups tests by Effection version and runs Turbo once per version, which avoids override conflicts while keeping parallelism within each version group.

### Workflow

1) Resolve all min/max versions across packages.
2) For each unique version:
   - apply override + install
   - run Turbo tests across the workspace (parallel within that version)
3) Repeat for the next version.

```bash
node --env-file=.env .internal/effection-compat.ts
```

### Turbo Config Sketch (`turbo.json`)

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
      "outputs": []
    }
  }
}
```

### Root Script Hook

```json
{
  "scripts": {
    "test:effection": "node --env-file=.env .internal/effection-compat.ts"
  }
}
```

### Runner Sketch (`.internal/effection-compat.ts`)

```ts
import path from "node:path";
import { type Operation, run } from "effection";
import { exec } from "@effectionx/process";
import { readTextFile, writeTextFile } from "@effectionx/fs";
import semver from "semver";

type PackageInfo = { name: string; dir: string; peerRange: string | null };

type VersionPair = { min: string; max: string };

const rootDir = process.cwd();

const runCommand = (command: string) => exec(command).expect();

const readJson = function* <T>(filePath: string): Operation<T> {
  const raw = yield* readTextFile(filePath);
  return JSON.parse(raw) as T;
};

const getWorkspacePackages = function* (): Operation<PackageInfo[]> {
  const workspace = yield* readTextFile(path.join(rootDir, "pnpm-workspace.yaml"));
  const lines = workspace.split(/\r?\n/).filter((line) => line.trim().startsWith("-"));
  const entries = lines.map((line) => line.replace(/^\s*-\s*/, "").replace(/['"]/g, ""));

  const packages: PackageInfo[] = [];
  for (const entry of entries) {
    const dir = path.join(rootDir, entry);
    const pkgPath = path.join(dir, "package.json");
    const pkg = yield* readJson<{ name: string; peerDependencies?: Record<string, string> }>(pkgPath);
    packages.push({
      name: pkg.name,
      dir,
      peerRange: pkg.peerDependencies?.effection ?? null,
    });
  }
  return packages;
};

const fetchEffectionVersions = function* (): Operation<string[]> {
  const { stdout } = yield* runCommand("npm view effection versions --json");
  return JSON.parse(stdout) as string[];
};

const resolveVersionPair = (allVersions: string[], range: string): VersionPair => {
  const min = semver.minVersion(range)?.version;
  if (!min) throw new Error(`No min version for range: ${range}`);

  const stableMax = semver.maxSatisfying(allVersions, range, { includePrerelease: false });
  const max = stableMax ?? semver.maxSatisfying(allVersions, range, { includePrerelease: true });
  if (!max) throw new Error(`No max version for range: ${range}`);

  return { min, max };
};

const resolveVersionGroups = function* (): Operation<string[]> {
  const packages = yield* getWorkspacePackages();
  const allVersions = yield* fetchEffectionVersions();
  const unique = new Set<string>();

  for (const pkg of packages) {
    if (!pkg.peerRange) continue;
    const { min, max } = resolveVersionPair(allVersions, pkg.peerRange);
    unique.add(min);
    unique.add(max);
  }

  return Array.from(unique).sort(semver.compare);
};

const main = function* (): Operation<void> {
  const configJson = JSON.stringify({
    $schema: "https://turbo.build/schema.json",
    tasks: {
      build: { outputs: ["dist/**", "*.tsbuildinfo"] },
      lint: { outputs: [] },
      check: { outputs: [] },
      test: { dependsOn: ["^check"], outputs: [], cache: false },
    },
  }, null, 2);
  const configPath = "/tmp/turbo.effection.json";

  yield* writeTextFile(configPath, configJson);

  const versions = yield* resolveVersionGroups();

  for (const version of versions) {
    yield* runCommand(`pnpm config set --location project pnpm.overrides.effection=${version}`);
    yield* runCommand("pnpm install --no-frozen-lockfile");
    yield* runCommand(`pnpm turbo run test --config ${configPath}`);
  }

  yield* runCommand("pnpm config delete --location project pnpm.overrides.effection");
  yield* runCommand("pnpm install --no-frozen-lockfile");
};

run(main);
```

### Version Swap Mechanism (Selected)

The runner applies overrides per **version group**:

- Set the override once per version: `pnpm config set pnpm.overrides.effection=<version>`
- Install with `pnpm install --no-frozen-lockfile`
- Run `pnpm turbo run test --config /tmp/turbo.effection.json` for that group
- Clear the override and reinstall at the end

**Lockfiles decision (for posterity):** we are not using per-version lockfiles for compatibility runs because they are high-maintenance and would require keeping multiple lockfiles in sync across the workspace.

### Notes on Turbo Usage

- `test` runs with the full Turbo task graph, so you can use `turbo run lint`, `turbo run check`, or `turbo run build` with the same config file.
- Turbo does not natively manage dependency swaps; the runner handles overrides per version group.
- Use `cache: false` to avoid cross-version caching artifacts in `test` when running the version groups.
- Since this is local-only, `pnpm` can use `packageImportMethod=hardlink` for faster installs if your filesystem supports it.

### Watch Mode

Watch mode should be limited to **one package + one Effection version** to avoid override conflicts:

- Resolve the package’s min or max Effection version.
- Apply the override once.
- Run the package test command with watch enabled.

Example flow:

```bash
pnpm config set pnpm.overrides.effection=<version>
pnpm install --no-frozen-lockfile
pnpm --filter @effectionx/process test --watch
```

---

## Recommendation

Use **per version groups** so overrides are safe and parallelism stays within each Effection version.

## CI Usage (Optional)

If you want to run the compatibility matrix in CI, reuse the runner so the version grouping stays consistent:

```bash
pnpm test:effection
```

Notes:
- This requires `--no-frozen-lockfile` because the runner swaps Effection versions per group.
- Consider a separate CI job so regular tests remain locked to the committed `pnpm-lock.yaml`.
