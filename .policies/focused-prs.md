# Keep PRs Focused Policy (Experimental)

This document defines the experimental policy for maintaining focused, reviewable pull requests without IDE-driven churn.

## Core Principle

**Unrelated changes and formatter churn hide the real diff and make review harder.** Keep PRs focused on a single concern.

## The Rule

| Change Type                  | Required Handling                         |
| ---------------------------- | ----------------------------------------- |
| Feature + formatting         | Separate PRs (formatting first if needed) |
| Feature + unrelated refactor | Separate PRs                              |
| IDE-generated changes        | Revert or split into dedicated PR         |
| Large reformatting           | Dedicated PR with no logic changes        |
| Drive-by fixes               | Separate PR unless trivially small        |

## Examples

### Compliant: Focused PR with single concern

```markdown
# PR: fix: halt losers in race-like helper

## Changes

- Fixed race() to halt losing operations immediately
- Added test for halt behavior

## Files Changed

- race.ts (logic fix)
- race.test.ts (new test)
```

### Compliant: Separated formatting PR

```markdown
# PR 1: style: apply biome formatting to package

## Changes

- Applied biome fmt to all files
- No logic changes

---

# PR 2: fix: correct halt timing in race()

## Changes

- Fixed halt behavior (logic change)
```

### Non-Compliant: Mixed feature and formatting

```markdown
# PR: fix: race helper and also format everything

## Files Changed (showing +500 -300)

- race.ts (+20 -10) <- actual fix buried in here
- helper.ts (+100 -100) <- formatter changes only
- utils.ts (+150 -150) <- formatter changes only
- types.ts (+50 -50) <- formatter changes only
- ... 20 more files

# Reviewer cannot easily find the actual logic change
```

### Non-Compliant: IDE-driven churn included

```typescript
// File shows in diff due to IDE reformatting import order
// or adding trailing commas, but no actual changes to logic

- import { spawn, sleep } from "effection";
- import { each } from "effection";
+ import { each, sleep, spawn } from "effection";

// This noise hides real changes elsewhere in the PR
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] PR has single, clear purpose
- [ ] No unrelated formatting changes mixed with logic
- [ ] IDE auto-format changes are reverted or isolated
- [ ] Drive-by refactors are in separate PRs
- [ ] Large style changes are dedicated PRs

## Common Mistakes

| Mistake                             | Fix                                        |
| ----------------------------------- | ------------------------------------------ |
| "While I was here..." refactors     | Separate PR                                |
| IDE reformatted imports             | Configure IDE or revert                    |
| Prettier/Biome ran on touched files | Run formatter on all files in dedicated PR |
| "Small" unrelated fix included      | Separate PR; keep reviews focused          |

## Tooling Tips

To avoid IDE-driven churn:

```bash
# Use project's formatter, not IDE's
pnpm fmt

# Check what would change before committing
pnpm fmt:check

# Stage only intentional changes
git add -p
```

## Related Policies

- [Version Bump](./version-bump.md) - One logical change per version
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
