# Backwards Compatibility and Deprecation Policy (Experimental)

This document defines the experimental policy for managing breaking changes and deprecation paths.

## Core Principle

**Be explicit about breaking changes; deprecate intentionally; keep release/versioning coherent.** Lifecycle semantic changes are potentially breaking even when types don't change.

## The Rule

| Change Type                 | Required Action                                       |
| --------------------------- | ----------------------------------------------------- |
| Removed export              | Major version bump + migration docs                   |
| Changed function signature  | Major version bump if breaking                        |
| Changed lifecycle semantics | Evaluate as potentially breaking; document            |
| Renamed export              | Deprecate old name, export both, remove in next major |
| Changed default behavior    | Minor bump + changelog + docs update                  |

## Examples

### Compliant: Proper deprecation path

```typescript
/**
 * @deprecated Use `useWebSocket()` instead. Will be removed in v3.0.
 */
export function connectSocket(url: string): Operation<Socket> {
  console.warn("connectSocket is deprecated, use useWebSocket instead");
  return useWebSocket(url);
}

// New API exported alongside
export function useWebSocket(url: string): Operation<WebSocket> {
  // ...
}
```

### Compliant: Lifecycle change documented as breaking

```typescript
// CHANGELOG.md
// ## 2.0.0 - BREAKING CHANGES
//
// ### `race()` now halts losers immediately
//
// Previously, `race()` would wait for all operations to settle.
// Now it halts losing operations as soon as a winner is determined.
//
// **Migration:** If you relied on losers completing, use `all()` instead.
```

### Non-Compliant: Silent removal

```typescript
// v1.0.0 had: export function connectSocket(...) { ... }
// v1.1.0: function removed with no deprecation warning or major bump
// BAD: breaks consumers silently
```

### Non-Compliant: Lifecycle change without version bump

```typescript
// Changed halt timing from "after cleanup" to "before cleanup"
// but version stayed at 1.2.3 → 1.2.4 (patch)
// BAD: semantic change requires at least minor bump + docs
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] Removed/renamed exports have deprecation warnings
- [ ] Breaking changes bump major version
- [ ] Lifecycle semantic changes are evaluated for breaking impact
- [ ] CHANGELOG documents all user-visible changes
- [ ] Migration notes exist for breaking changes
- [ ] See also: [Version Bump Policy](./version-bump.md)

## Common Mistakes

| Mistake                           | Fix                                   |
| --------------------------------- | ------------------------------------- |
| Remove export in minor version    | Add deprecation, remove in next major |
| Change behavior without changelog | Document in CHANGELOG.md              |
| Lifecycle change as patch         | Evaluate as minor or major            |
| No migration path                 | Provide before/after code examples    |

## Related Policies

- [Version Bump](./version-bump.md) - Semantic versioning requirements
- [Documentation](./documentation.md) - Documenting changes
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
