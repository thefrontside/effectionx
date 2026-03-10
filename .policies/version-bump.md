# Version Bump Policy (Recommended)

This document defines the recommended policy for semantic version bumps in pull requests.

## Core Principle

**Every PR that changes a package's published code must include a semantic version bump.**

## The Rule

| Change Type | Version Bump | Example |
|-------------|--------------|---------|
| Breaking changes | Major (`X.0.0`) | Removing exports, changing signatures |
| New features | Minor (`0.X.0`) | Adding new exports, new functionality |
| Bug fixes | Patch (`0.0.X`) | Fixing bugs, documentation |
| No published code changes | None required | CI config, tests only, dev dependencies |

**Applies to:** Changes in package source files (`mod.ts`, `*.ts` excluding `*.test.ts`)

**Does not apply to:**
- Changes only to test files (`*.test.ts`)
- Changes only to CI/workflow files (`.github/`)
- Changes only to documentation (`README.md`, `.md` files)
- Changes only to dev dependencies

## Examples

### Compliant: Bug fix with patch bump

```diff
// package.json
{
  "name": "@effectionx/vitest",
- "version": "0.1.0",
+ "version": "0.1.1",
}
```

### Compliant: New feature with minor bump

```diff
// package.json
{
  "name": "@effectionx/stream-helpers",
- "version": "0.2.0",
+ "version": "0.3.0",
}
```

### Compliant: Test-only changes (no bump needed)

```
Changed files:
- vitest/vitest.test.ts
- vitest/test/fixtures/example.ts

No version bump required - only test files changed.
```

### Non-Compliant: Code change without version bump

```
Changed files:
- vitest/mod.ts        # Source code changed
- vitest/package.json  # No version bump!

Violation: Source code changed but version was not bumped.
```

## Cascade Rule

**When a package is bumped, all packages that list it as a published dependency
(`dependencies` or `peerDependencies` with `workspace:*`) must also be bumped.**

This ensures dependents are republished with the updated dependency range.
`devDependencies` are excluded because they are stripped at publish time.

### Tooling

| Command | Purpose |
|---------|---------|
| `pnpm versions` | **Check** — verifies all cascade bumps are present (runs in CI) |
| `pnpm versions:sync` | **Fix** — auto-applies patch bumps to dependents that need them |

### Example

If `@effectionx/test-adapter` is bumped from `0.7.3` to `0.7.4`:
- `@effectionx/bdd` depends on it via `"@effectionx/test-adapter": "workspace:*"`
- `@effectionx/bdd` must also be bumped (at minimum a patch bump)
- Run `pnpm versions:sync` to apply the cascade bumps automatically

## Verification Checklist

- [ ] If source files changed, `package.json` version was bumped
- [ ] Version bump type matches the change (major/minor/patch)
- [ ] Only one package version bumped per PR (unless changes span packages)
- [ ] Cascade bumps applied for all published dependents (`pnpm versions` passes)

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to bump version after bug fix | Add patch version bump to `package.json` |
| Using patch for new features | Use minor version bump instead |
| Bumping version for test-only changes | Remove unnecessary version bump |
| Forgetting to bump dependents after a dep changes | Run `pnpm versions:sync` |

## Related Policies

- [Policies Index](./index.md)
