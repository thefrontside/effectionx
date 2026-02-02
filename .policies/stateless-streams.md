# Stateless Stream Operations Policy (Recommended)

This document defines the recommended policy for implementing stateless stream operations.

## Core Principle

**Stream operations must use the `*[Symbol.iterator]` pattern so they can be stored as constants and reused without side effects.**

## The Rule

| Scenario | Required Approach |
|----------|-------------------|
| Functions returning `Operation<T>` that operate on streams | Return object with `*[Symbol.iterator]()` method |
| Simple utility functions | Regular `function*` generator is acceptable |

**Key distinction:** Calling `drain(stream)` should return an object, not start execution. Execution only begins when you `yield*` the result.

## Examples

### Compliant: Using *[Symbol.iterator] for stream operations

From `stream-helpers/drain.ts`:

```typescript
import type { Operation, Stream } from "effection";

export function drain<T, TClose>(stream: Stream<T, TClose>): Operation<TClose> {
  return {
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      let result = yield* subscription.next();
      while (!result.done) {
        result = yield* subscription.next();
      }
      return result.value;
    },
  };
}
```

### Compliant: Functions with multiple variants

From `stream-helpers/first.ts`:

```typescript
function _first<T, TClose>(
  stream: Stream<T, TClose>,
): Operation<T | undefined> {
  return {
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      const result = yield* subscription.next();
      if (result.done) {
        return undefined;
      }
      return result.value;
    },
  };
}

function expectFirst<T, TClose>(stream: Stream<T, TClose>): Operation<T> {
  return {
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      const result = yield* subscription.next();
      if (result.done) {
        throw new Error("Stream closed without yielding any values");
      }
      return result.value;
    },
  };
}

export const first = Object.assign(_first, { expect: expectFirst });
```

### Non-Compliant: Using function* directly

```typescript
// BAD: Executes immediately when called
export function* drain<T, TClose>(
  stream: Stream<T, TClose>,
): Operation<TClose> {
  const subscription = yield* stream;
  let result = yield* subscription.next();
  while (!result.done) {
    result = yield* subscription.next();
  }
  return result.value;
}
```

## Verification Checklist

- [ ] All functions in `stream-helpers/` returning `Operation<T>` use `*[Symbol.iterator]`
- [ ] Operation can be stored as a constant and reused
- [ ] Each `yield*` of the operation creates a fresh iterator

## Common Mistakes

| Mistake | Fix |
|---------|-----|
| Using `function*` directly for stream operations | Wrap in object with `*[Symbol.iterator]()` |
| Forgetting to return the object | Ensure `return { *[Symbol.iterator]() { ... } }` |
| Using arrow function instead of method | Use `*[Symbol.iterator]()` method syntax |

## Why This Matters

1. **Deferred execution**: The operation doesn't start until `yield*`
2. **Reusability**: Store operations as constants, use multiple times
3. **Consistency**: Matches pattern used by `map()` and other stream helpers

## Related Policies

- [No-Sleep Test Synchronization](./no-sleep-test-sync.md) - Deterministic test patterns
- [Policies Index](./index.md)
