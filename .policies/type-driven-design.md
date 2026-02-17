# Type-Driven Design Policy (Experimental)

This document defines the experimental policy for type-safe API design that makes invalid states unrepresentable.

## Core Principle

**Types should force correct usage and make invalid states unrepresentable.** No escaping through `any`.

## The Rule

| Context                 | Required Behavior                                                        |
| ----------------------- | ------------------------------------------------------------------------ |
| Public exported APIs    | No `any`; use `unknown` + narrowing or discriminated unions              |
| Operation return types  | Prefer `Operation<unknown>` over `Operation<any>` when type is not known |
| Generic type parameters | Use constraints (`T extends X`) rather than unconstrained `any`          |
| Internal implementation | `any` allowed only with justification comment                            |
| Type assertions         | Prefer type guards over `as any` casts                                   |

## Examples

### Compliant: Using unknown with narrowing

```typescript
import { call, type Operation } from "effection";

export function parseMessage(input: unknown): Operation<Message> {
  return call(() => {
    if (!isMessage(input)) throw new Error("invalid message");
    return input;
  });
}

function isMessage(value: unknown): value is Message {
  return typeof value === "object" && value !== null && "type" in value;
}
```

### Compliant: Discriminated unions for variants

```typescript
type Result<T> = { ok: true; value: T } | { ok: false; error: Error };

export function* tryOperation<T>(op: Operation<T>): Operation<Result<T>> {
  try {
    return { ok: true, value: yield* op };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error : new Error(String(error)),
    };
  }
}
```

### Non-Compliant: Using any in public API

```typescript
// BAD: any erodes type safety for callers
export function parseMessage(input: any): Operation<any> {
  return call(() => input);
}
```

### Non-Compliant: Unconstrained generic with any fallback

```typescript
// BAD: T is unconstrained and defaults to any behavior
export function transform<T>(value: T): T {
  return value as any; // loses all type information
}
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] No `any` in exported function signatures or return types
- [ ] No `any` in exported type aliases or interfaces
- [ ] `unknown` is used with proper type narrowing before use
- [ ] Generic parameters have appropriate constraints
- [ ] Internal `any` usage has justification comments

## Common Mistakes

| Mistake                                      | Fix                                            |
| -------------------------------------------- | ---------------------------------------------- |
| `Operation<any>` for unknown return          | Use `Operation<unknown>` + narrow at call site |
| `(value: any) =>` in callbacks               | Use `(value: unknown) =>` + type guard         |
| `as any` to silence errors                   | Add proper overloads or fix underlying type    |
| Unconstrained `<T>` with runtime assumptions | Add `T extends SomeBase` constraint            |

## Related Policies

- [Correctness Through Explicit Invariants](./correctness-invariants.md) - Runtime validation complements type-time safety
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
