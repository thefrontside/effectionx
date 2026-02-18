# Naming and Consistency Policy (Experimental)

This document defines the experimental policy for consistent, intent-revealing names across the codebase.

## Core Principle

**Names should be specific and consistent; formatting should reinforce readability, not noise.** Enforce Effection vocabulary consistency.

## The Rule

| Context              | Required Naming                                                               |
| -------------------- | ----------------------------------------------------------------------------- |
| Effection primitives | Use established terms: `Operation`, `Task`, `Scope`, `Stream`, `Subscription` |
| Resource functions   | Prefix with `use` (e.g., `useWebSocket`, `useAbortSignal`)                    |
| Stream operations    | Use verb form (e.g., `map`, `filter`, `reduce`, `drain`)                      |
| Conversion functions | Use `to`/`from` prefix (e.g., `toAsyncIterable`, `fromChannel`)               |
| Generic helpers      | Avoid vague names like `run`, `do`, `handle`, `process`                       |

## Examples

### Compliant: Effection vocabulary

```typescript
import type { Operation, Stream, Task, Scope } from "effection";

// Clear Effection terminology
export function toStream<T>(iterable: AsyncIterable<T>): Stream<T> {
  return stream(iterable);
}

// Resource convention with 'use' prefix
export function useCache(options: CacheOptions): Operation<Cache> {
  return resource(/* ... */);
}
```

### Compliant: Specific, intent-revealing names

```typescript
// Name describes exactly what it does
export function drainToArray<T>(stream: Stream<T>): Operation<T[]> {
  // ...
}

// Clear about the transformation
export function mapAsync<T, U>(
  fn: (item: T) => Operation<U>,
): (stream: Stream<T>) => Stream<U> {
  // ...
}
```

### Non-Compliant: Vague or inconsistent naming

```typescript
// BAD: "run" is too generic, doesn't indicate Operation semantics
export function runAsyncThing<T>(x: T): T {
  return x;
}

// BAD: inconsistent with Effection vocabulary
export function executeTask<T>(operation: Operation<T>): Promise<T> {
  // "execute" not standard; use "run" only at entry points
  return Promise.resolve() as Promise<T>;
}
```

### Non-Compliant: Missing resource prefix

```typescript
// BAD: Resources should use 'use' prefix
export function createWebSocket(url: string): Operation<WebSocket> {
  return resource(/* ... */);
}

// GOOD:
export function useWebSocket(url: string): Operation<WebSocket> {
  return resource(/* ... */);
}
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] Effection terms used correctly (`Operation`, `Task`, `Scope`, `Stream`)
- [ ] Resources prefixed with `use`
- [ ] Stream operations use verb form
- [ ] Conversion functions use `to`/`from` prefix
- [ ] No ambiguous generic names (`run`, `do`, `handle`)
- [ ] Same concept uses same word throughout package

## Common Mistakes

| Mistake                              | Fix                                                 |
| ------------------------------------ | --------------------------------------------------- |
| `createX` for resource               | `useX` (resource convention)                        |
| `runOperation`                       | Just `yield*` the operation                         |
| Mixed `Stream`/`Channel` terminology | Pick one per context, be consistent                 |
| `process()` / `handle()`             | Use specific verb: `parse`, `validate`, `transform` |

## Related Policies

- [Documentation](./documentation.md) - Names should be self-documenting
- [Minimal APIs](./minimal-apis.md) - Platform-aligned naming
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
