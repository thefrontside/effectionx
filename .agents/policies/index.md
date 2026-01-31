# Policies Index

This is the **single source of truth** for all policies in this repository. The [Policy Officer](../policy-officer.md) agent uses this index to determine which policies to enforce.

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

<!-- Example entries:
| [Naming Conventions](./naming-conventions.md) | Strict | File and function naming patterns |
| [Error Handling](./error-handling.md) | Recommended | Consistent error handling patterns |
| [New API Design](./new-api-design.md) | Experimental | Proposed API patterns (feedback only) |
-->

## Adding a New Policy

1. Copy [POLICY_TEMPLATE.md](./POLICY_TEMPLATE.md) to a new file (e.g., `my-policy.md`)
2. Fill in all sections following the template structure
3. Add an entry to the **Policy Documents** table above
4. Set the appropriate state (Strict, Recommended, or Experimental)

## For AI Agents

When reviewing code changes:

1. Read this index to get the list of applicable policies
2. For each policy in the table, read the linked document
3. Apply each policy's checks to the changed artifacts
4. Report violations using the format in [policy-officer.md](../policy-officer.md)
