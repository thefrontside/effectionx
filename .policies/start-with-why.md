# Start With Why (Intent First) Policy (Experimental)

This document defines the experimental policy for understanding intent before prescribing changes. This is primarily a **review rubric** rather than a code rule.

## Core Principle

**Ask for the underlying intent and constraints before prescribing a change.** If a change introduces new API surface or complexity without explanation, request intent/goal and tradeoffs.

## The Rule

| Situation                  | Required Action                                |
| -------------------------- | ---------------------------------------------- |
| New exported API           | PR must explain the user problem it solves     |
| New combinator/helper      | Document why existing primitives don't suffice |
| Complexity increase        | Explain tradeoffs and alternatives considered  |
| Non-obvious implementation | Comment explaining the "why"                   |
| Lifecycle/semantic changes | Document rationale for behavior choice         |

## Examples

### Compliant: PR with clear motivation

```markdown
## PR Description

### Problem

Users frequently need to fetch JSON with proper cancellation support.
Currently this requires:

1. Getting an abort signal
2. Wrapping fetch with until()
3. Calling response.json()

### Solution

Add `fetchJson()` helper that handles all three steps:

### Alternatives Considered

- Document the pattern instead: Rejected because it's error-prone
- Add to effection core: Rejected to keep core minimal
```

### Compliant: Code with explanatory comments

```typescript
function* race<T>(ops: Operation<T>[]): Operation<T> {
  // We halt losers immediately rather than waiting for them to settle.
  // This ensures cleanup runs promptly and prevents resource leaks
  // when the winner completes quickly.
  return yield* scoped(function* (scope) {
    let winner = yield* Promise.race(ops.map((op) => scope.run(op)));
    // Losers are halted when scope exits
    return winner;
  });
}
```

### Non-Compliant: New API without explanation

```typescript
// PR adds 4 new exports with no description of use case:
export function fetchWithRetry(...) { }
export function fetchWithTimeout(...) { }
export function fetchWithCache(...) { }
export function fetchWithTracing(...) { }

// Reviewer should ask: What problem are these solving?
// Why these specific combinations? Why not composable primitives?
```

### Non-Compliant: Complex implementation without rationale

```typescript
// BAD: Why this specific approach? What constraints led here?
function* complexOperation(): Operation<void> {
  let cache = new WeakMap();
  let pending = new Set();
  // ... 50 lines of non-obvious logic ...
}
```

## Reviewer Guidance

When reviewing, ask these questions if not answered in PR:

1. **What user problem does this solve?**
2. **Why can't existing APIs solve it?**
3. **What tradeoffs were considered?**
4. **Why this specific design/behavior?**

Frame as curiosity, not criticism:

- "Help me understand why..."
- "I'm curious about the choice to..."
- "What led to this approach vs...?"

## Verification Checklist

Before marking a review complete, verify:

- [ ] PR description explains the motivation/problem
- [ ] New APIs have documented use cases
- [ ] Non-obvious implementations have explanatory comments
- [ ] Tradeoffs are documented for significant choices
- [ ] Behavior choices (especially lifecycle) are explained

## Common Mistakes

| Mistake                             | Fix                              |
| ----------------------------------- | -------------------------------- |
| "Added helper" without context      | Describe the user problem        |
| Implementation without rationale    | Add comment explaining "why"     |
| API without use case                | Show example of intended usage   |
| Behavior choice without explanation | Document alternatives considered |

## Related Policies

- [Documentation](./documentation.md) - Document the "why" not just the "what"
- [Minimal APIs](./minimal-apis.md) - Justify new API surface
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
