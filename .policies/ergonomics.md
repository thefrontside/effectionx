# Make the Happy Path Easy (Ergonomics) Policy (Experimental)

This document defines the experimental policy for API ergonomics that guide users into correct usage with minimal ceremony.

## Core Principle

**Prefer APIs that guide users into the right thing with minimal ceremony.** If the same boilerplate appears in multiple call sites, consider an ergonomic helper that preserves the underlying primitive semantics.

## The Rule

| Scenario               | Required Behavior                                      |
| ---------------------- | ------------------------------------------------------ |
| Repeated boilerplate   | Consider helper that preserves primitive semantics     |
| Common patterns        | Provide ergonomic wrapper alongside primitive          |
| Error-prone sequences  | Combine into single operation                          |
| Ownership/cancellation | Helpers must preserve structured concurrency semantics |
| Primitive access       | Keep primitives available for advanced use cases       |

## Examples

### Compliant: Ergonomic helper preserving semantics

```typescript
import { useAbortSignal, until, call, type Operation } from "effection";

// Ergonomic helper that preserves cancellation semantics
export function* fetchText(url: string): Operation<string> {
  let signal = yield* useAbortSignal();
  let response = yield* until(fetch(url, { signal }));
  return yield* call(() => response.text());
}

// Usage is simple and correct
function* main(): Operation<void> {
  let text = yield* fetchText("/api/data");
  // Properly cancelled if scope exits
}
```

### Compliant: Helper alongside primitive

```typescript
// Primitive for full control
export function* mapStream<T, U>(
  fn: (item: T) => Operation<U>,
  stream: Stream<T>,
): Stream<U> {
  // ... implementation
}

// Ergonomic curried form for common use
export function map<T, U>(
  fn: (item: T) => Operation<U>,
): (stream: Stream<T>) => Stream<U> {
  return (stream) => mapStream(fn, stream);
}

// Both available - user chooses
let transformed = map(processItem)(inputStream);
let transformed2 = yield * mapStream(processItem, inputStream);
```

### Non-Compliant: Helper that hides ownership

```typescript
// BAD: Bypasses scope ownership/cancellation semantics
export function fetchTextUnsafe(url: string): Promise<string> {
  // No abort signal, no scope integration
  return fetch(url).then((r) => r.text());
}

// Caller has no way to cancel this!
```

### Non-Compliant: Boilerplate left to users

```typescript
// Without helper, users must repeat this pattern everywhere:
function* everyCallSite(): Operation<Data> {
  let signal = yield* useAbortSignal();
  let response = yield* until(fetch("/api/data", { signal }));
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return yield* call(() => response.json());
}

// This pattern repeated 10+ times = candidate for helper
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] Common patterns have ergonomic helpers
- [ ] Helpers preserve cancellation/scope semantics
- [ ] Underlying primitives remain accessible
- [ ] Helpers don't hide important lifecycle behavior
- [ ] Balance with [Minimal APIs](./minimal-apis.md) policy

## Common Mistakes

| Mistake                   | Fix                                            |
| ------------------------- | ---------------------------------------------- |
| Helper returns Promise    | Return Operation with proper scope integration |
| Helper hides abort signal | Use `useAbortSignal()` internally              |
| Only primitive, no helper | Add helper when pattern repeats 3+ times       |
| Only helper, no primitive | Export both for flexibility                    |

## Related Policies

- [Minimal APIs](./minimal-apis.md) - Balance ergonomics with minimal surface
- [Structured Concurrency](./structured-concurrency.md) - Preserve lifecycle semantics
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
