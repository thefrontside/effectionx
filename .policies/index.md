# Policies Index

This is the **single source of truth** for all policies in this repository.

## Policy States

| State | Compliance | Description |
|-------|------------|-------------|
| **Strict** | Required | Violations must be fixed before merge |
| **Recommended** | Required | Violations should be fixed; exceptions need justification |
| **Experimental** | Advisory | Feedback only; no blocking violations |

## Policy Documents

| Policy | State | Description |
|--------|-------|-------------|
| [No-Sleep Test Synchronization](./no-sleep-test-sync.md) | Recommended | Use deterministic helpers instead of sleep() for test synchronization |
| [Stateless Stream Operations](./stateless-streams.md) | Recommended | Use `*[Symbol.iterator]` pattern for reusable stream operations |
| [Version Bump](./version-bump.md) | Recommended | PRs changing package code must include a semantic version bump |

<!-- Example entries:
| [Naming Conventions](./naming-conventions.md) | Strict | File and function naming patterns |
| [Error Handling](./error-handling.md) | Recommended | Consistent error handling patterns |
| [New API Design](./new-api-design.md) | Experimental | Proposed API patterns (feedback only) |
-->

## Adding a New Policy

1. Copy [template.md](./template.md) to a new file (e.g., `my-policy.md`)
2. Fill in all sections following the template structure
3. Add an entry to the **Policy Documents** table above
4. Set the appropriate state (Strict, Recommended, or Experimental)

