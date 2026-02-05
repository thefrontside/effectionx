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

## Verification Checklist

- [ ] If source files changed, `package.json` version was bumped
- [ ] Version bump type matches the change (major/minor/patch)
- [ ] Only one package version bumped per PR (unless changes span packages)

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Forgetting to bump version after bug fix | Add patch version bump to `package.json` |
| Using patch for new features | Use minor version bump instead |
| Bumping version for test-only changes | Remove unnecessary version bump |

## Related Policies

- [Policies Index](./index.md)
