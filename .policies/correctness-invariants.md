# Correctness Through Explicit Invariants Policy (Experimental)

This document defines the experimental policy for encoding assumptions explicitly through validation and error handling.

## Core Principle

**Prefer explicit invariants and error handling to "it probably works" assumptions.** Validate inputs, handle error paths, and test edge cases.

## The Rule

| Context              | Required Behavior                            |
| -------------------- | -------------------------------------------- |
| External input       | Validate and narrow `unknown` before use     |
| Operation boundaries | Handle success, error, and halt paths        |
| Impossible states    | Use exhaustive checks or throw               |
| Resource cleanup     | Test that cleanup runs on halt               |
| Assumptions          | Encode as runtime checks or type constraints |

## Examples

### Compliant: Explicit input validation

```typescript
import { call, type Operation } from "effection";

function* readPort(value: unknown): Operation<number> {
  return yield* call(() => {
    if (typeof value !== "number" || value <= 0 || value > 65535) {
      throw new Error(`invalid port: ${value}`);
    }
    return value;
  });
}
```

### Compliant: Exhaustive state handling

```typescript
type Status = "pending" | "running" | "completed" | "failed";

function getStatusMessage(status: Status): string {
  switch (status) {
    case "pending":
      return "Waiting to start";
    case "running":
      return "In progress";
    case "completed":
      return "Done";
    case "failed":
      return "Error occurred";
    default: {
      // Exhaustive check - TypeScript will error if a case is missed
      const _exhaustive: never = status;
      throw new Error(`Unknown status: ${_exhaustive}`);
    }
  }
}
```

### Compliant: Testing all paths

```typescript
describe("useConnection", () => {
  it("connects successfully", function* () {
    let conn = yield* useConnection("ws://localhost");
    expect(conn.ready).toBe(true);
  });

  it("throws on invalid URL", function* () {
    yield* expect(useConnection("invalid")).rejects.toThrow("invalid URL");
  });

  it("cleans up on halt", function* () {
    let closed = false;
    let task = yield* spawn(useConnection("ws://localhost"));
    yield* task.halt();
    expect(closed).toBe(true);
  });
});
```

### Non-Compliant: Assumed invariant without check

```typescript
function* readPort(value: unknown): Operation<number> {
  return value as number; // BAD: invariant assumed, not enforced
}
```

### Non-Compliant: Missing error/halt path tests

```typescript
describe("useConnection", () => {
  it("connects", function* () {
    let conn = yield* useConnection("ws://localhost");
    expect(conn).toBeDefined();
  });
  // BAD: No tests for error case or halt/cleanup
});
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] External inputs are validated with `unknown` narrowing
- [ ] Error paths throw with descriptive messages
- [ ] Tests cover success, error, and halt scenarios
- [ ] Exhaustive checks on discriminated unions
- [ ] Cleanup behavior is tested

## Common Mistakes

| Mistake                        | Fix                          |
| ------------------------------ | ---------------------------- |
| `as Type` without validation   | Add runtime check first      |
| Catch-all `catch (e)` silently | Log or rethrow with context  |
| Only testing happy path        | Add error and halt tests     |
| `default:` that ignores values | Add exhaustive `never` check |

## Related Policies

- [Type-Driven Design](./type-driven-design.md) - Type-time safety complements runtime checks
- [Deterministic Tests](./deterministic-tests.md) - Testing invariants
- [Structured Concurrency](./structured-concurrency.md) - Halt path handling
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
