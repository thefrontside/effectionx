# Structured Concurrency Policy (Experimental)

This document defines the experimental policy for structured concurrency patterns that make task lifetimes explicit and deterministic.

## Core Principle

**Concurrency must be structured: cancellation, cleanup, and task lifetimes should be obvious and enforced.** No fire-and-forget async work.

## The Rule

| Scenario                    | Required Behavior                                                             |
| --------------------------- | ----------------------------------------------------------------------------- |
| Starting async work         | Must be owned by a scope via `resource()`, `spawn()` (yielded), or `scoped()` |
| Consuming Promises          | Use `until(promise)` to integrate with scope lifecycle                        |
| Cancellation-sensitive APIs | Use `useAbortSignal()` and pass to fetch/timers                               |
| Background tasks            | Must be spawned children, not detached                                        |
| Cleanup logic               | Must be in `finally` blocks or resource teardown                              |
| Changing a single context value for an operation | Use `Context.with(value, operation)` instead of `scoped()` + `scope.set()`. This creates an isolated child scope with the context set. |
| Applying middleware without affecting parent | Use `scoped()` to create an isolated child scope. Middleware/context changes affect only the scoped operation and its descendants, not the parent. Never use `createScope()` inside operations. |
| Returning an object with lifecycle | Use `resource()` instead of `scoped()`. Resource also creates a child scope but is designed for objects that need setup/teardown and outlive a single yield point. |
| Using `createScope()` at entry points | Always destructure both scope and destroy: `let [scope, destroy] = createScope(parent)`. The destroy function must be bound to a teardown event. |

## Examples

### Compliant: Structured polling with abort signal

```typescript
import { spawn, sleep, useAbortSignal, until, type Operation } from "effection";

function* poll(endpoint: string): Operation<void> {
  let signal = yield* useAbortSignal();
  while (true) {
    yield* until(fetch(endpoint, { signal }));
    yield* sleep(1000);
  }
}

function* main(): Operation<void> {
  let task = yield* spawn(poll("/health")); // child owned by current scope
  yield* sleep(5000);
  yield* task.halt(); // observed shutdown
}
```

### Compliant: Resource with proper teardown

```typescript
import { resource, until, type Operation } from "effection";

interface Connection {
  send(msg: string): Operation<void>;
}

function useConnection(url: string): Operation<Connection> {
  return resource(function* (provide) {
    let ws = new WebSocket(url);
    try {
      yield* until(new Promise((resolve) => (ws.onopen = resolve)));
      yield* provide({
        *send(msg: string) {
          ws.send(msg);
        },
      });
    } finally {
      ws.close(); // cleanup always runs
    }
  });
}
```

### Non-Compliant: Fire-and-forget spawn

```typescript
function* main(): Operation<void> {
  spawn(poll("/health")); // BAD: created but never yielded, not a structured child
  // scope exits without waiting for or halting the poll
}
```

### Non-Compliant: Unowned Promise

```typescript
function* main(): Operation<void> {
  void fetch("/health"); // BAD: eager promise, unowned by Effection scope
  // no way to cancel, no cleanup on scope exit
}
```

### Compliant: Single context override with Context.with()

```typescript
import { useScope, type Operation } from "effection";

// Context.with() creates an isolated child scope with the context value set
function durably<T>(operation: () => Operation<T>): Operation<T> {
  let reducer = new DurableReducer(stream);
  return ReducerContext.with(reducer, function* () {
    let scope = yield* useScope();
    reducer.installScopeMiddleware(scope);
    return yield* operation();
  });
}
```

### Non-Compliant: scoped() + scope.set() for single context

```typescript
// BAD: Verbose — scoped() + scope.set() when Context.with() does both
function durably<T>(operation: () => Operation<T>): Operation<T> {
  let reducer = new DurableReducer(stream);
  return scoped(function* () {
    let scope = yield* useScope();
    scope.set(ReducerContext, reducer); // BAD: use Context.with() instead
    return yield* operation();
  });
}
```

### Compliant: Isolated context with scoped() (multiple context changes)

```typescript
import { scoped, useScope, type Operation } from "effection";

// scoped() is appropriate when you need multiple context changes or middleware
function withInstrumentation<T>(operation: () => Operation<T>): Operation<T> {
  return scoped(function* () {
    let scope = yield* useScope();
    scope.around(api.Reducer, { /* effect handling middleware */ });
    scope.around(api.Outcome, { /* outcome observation middleware */ });
    return yield* operation();
  });
}
```

### Non-Compliant: Detached scope inside operation

```typescript
import { createScope, global } from "effection";

// BAD: Creates a scope detached from the caller — halt won't propagate
function durably<T>(operation: () => Operation<T>): Task<T> {
  let [scope] = createScope(global); // BAD: not a child of caller's scope
  scope.set(ReducerContext, reducer);
  return scope.run(operation); // BAD: returns Task instead of Operation
}
```

### Compliant: createScope at entry point with destroy

```typescript
// createScope is only appropriate at program entry points
let [scope, destroy] = createScope(global);

process.on("SIGINT", () => {
  scope.run(destroy); // teardown bound to signal
});

scope.run(main);
```

### Non-Compliant: createScope without destroy

```typescript
// BAD: No way to tear down the scope
let [scope] = createScope(global);
scope.run(main);
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] All `spawn()` calls are yielded (`yield* spawn(...)`)
- [ ] Promises are wrapped with `until()` for scope integration
- [ ] Fetch calls use `useAbortSignal()` for cancellation
- [ ] Resources have teardown in `finally` blocks
- [ ] No fire-and-forget `void asyncFn()` patterns
- [ ] No `createScope()` calls inside operations (only at entry points)
- [ ] Functions needing scope isolation use `scoped()` or `resource()`
- [ ] All `createScope()` calls destructure both `[scope, destroy]` with destroy bound to teardown

## Common Mistakes

| Mistake                         | Fix                                           |
| ------------------------------- | --------------------------------------------- |
| `spawn(op)` without yield       | `yield* spawn(op)` to attach to scope         |
| `await fetch(url)` in operation | `yield* until(fetch(url, { signal }))`        |
| `setTimeout` without cleanup    | Use `sleep()` or wrap with `useAbortSignal()` |
| Cleanup in `try` block          | Move to `finally` block for halt safety       |
| `createScope()` inside operation | Use `scoped()`, `resource()`, or `Context.with()` for isolated child scope |
| `scoped()` + `scope.set()` for single context | Use `Context.with(value, operation)` |
| `scoped()` for lifecycle object | Use `resource()` with `provide()` for objects needing teardown |
| Returning `Task<T>` from helper | Return `Operation<T>`, let caller `spawn()` if needed |
| `let [scope] = createScope(...)` | Always destructure destroy: `let [scope, destroy] = createScope(...)` and bind to teardown |

## Related Policies

- [No-Sleep Test Synchronization](./no-sleep-test-sync.md) - Deterministic test patterns for structured concurrency
- [Stateless Stream Operations](./stateless-streams.md) - Deferred execution pattern
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
