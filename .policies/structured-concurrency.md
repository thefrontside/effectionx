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
| Synchronous cleanup         | Must be in a `finally` block or resource teardown                             |
| Cleanup that needs `yield*` | Must be in `ensure()` — see [Async Teardown](./async-teardown.md)             |
| Changing one context value for an operation | Use `Context.with(value, operation)`, not `scoped()` + `scope.set()`. It creates the isolated child scope and sets the value in one step. |
| Applying middleware without affecting the parent | Use `scoped()`. Context changes and middleware affect only the scoped operation and its descendants. |
| Returning an object with a lifecycle | Use `resource()` rather than `scoped()`. It also creates a child scope, but is built for objects that need setup/teardown and outlive a single yield point. |
| Entering Effection from non-structured code | Use `createScope()`, but only at an integration boundary. Always destructure `[scope, destroy]` and bind `destroy` to the lifetime that owns the boundary. |

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

`ws.close()` is synchronous, so a `finally` block is fine here. Teardown that needs
`yield*` must use `ensure()` instead — a `yield*` inside `finally` disarms halt
propagation for that frame. See [Async Teardown](./async-teardown.md).

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

## Scope Isolation

Reach for the narrowest tool that does the job. `Context.with()` sets one value,
`scoped()` isolates several changes, `resource()` owns an object with a lifecycle.

### Compliant: Single context override with Context.with()

```typescript
import { createContext, type Operation } from "effection";

const TracerContext = createContext<Tracer>("tracer");

// Context.with() creates an isolated child scope with the value already set
function traced<T>(operation: () => Operation<T>): Operation<T> {
  return TracerContext.with(new Tracer(), operation);
}
```

### Non-Compliant: scoped() + scope.set() for a single value

```typescript
// BAD: two steps and an extra generator for what Context.with() does in one
function traced<T>(operation: () => Operation<T>): Operation<T> {
  return scoped(function* () {
    let scope = yield* useScope();
    scope.set(TracerContext, new Tracer()); // BAD: use Context.with() instead
    return yield* operation();
  });
}
```

### Compliant: Isolated middleware with scoped()

```typescript
import { scoped, useScope, type Operation } from "effection";

// scoped() earns its keep once there are several changes to isolate
function instrumented<T>(operation: () => Operation<T>): Operation<T> {
  return scoped(function* () {
    let scope = yield* useScope();
    scope.around(api.Request, requestLogging);
    scope.around(api.Outcome, outcomeMetrics);
    return yield* operation();
  });
}
```

## Integration Boundaries

`createScope()` is for **integration boundaries**: the points where code that is
not structurally concurrent needs to enter Effection. At a boundary there is no
ambient scope to inherit, and some foreign lifetime — a process, a request, a
subscription, a component — owns the scope instead of a parent operation. Bind
`destroy` to that lifetime.

Inside an operation you are never at a boundary. A scope already exists, so
inherit it with `useScope()` and use `scoped()`, `resource()`, or
`Context.with()` when you need isolation.

### Compliant: Program entry point

```typescript
import { createScope, global } from "effection";

// Boundary: the process owns the scope
let [scope, destroy] = createScope(global);

process.on("SIGINT", () => {
  scope.run(destroy); // destroy bound to the signal
});

scope.run(main);
```

### Compliant: Request boundary

```typescript
// Boundary: each request owns a scope for exactly its own lifetime
server.on("request", async (req, res) => {
  let [scope, destroy] = createScope(global);
  res.on("close", () => scope.run(destroy)); // destroy bound to the response
  await scope.run(() => handle(req, res));
});
```

### Compliant: Event subscription

```typescript
// Boundary: the emitter, not a parent operation, owns the handler's lifetime
let [scope, destroy] = createScope(global);
let unsubscribe = emitter.on("data", (event) => scope.run(() => handle(event)));

export function shutdown() {
  unsubscribe();
  return scope.run(destroy); // destroy bound to the subscription
}
```

### Compliant: Framework lifecycle

```typescript
// Boundary: the component's mount/unmount pair owns the scope
onMount(() => {
  let [scope, destroy] = createScope(global);
  scope.run(main);
  return () => scope.run(destroy); // destroy bound to unmount
});
```

### Non-Compliant: createScope() inside an operation

```typescript
import { createScope, global, suspend, type Operation } from "effection";

// BAD: an operation already has a scope, so this one is detached from the caller
function* listen(): Operation<void> {
  let [scope] = createScope(global); // BAD: halt no longer propagates from the caller
  emitter.on("data", (event) => scope.run(() => handle(event)));
  yield* suspend();
}
```

Inherit the ambient scope instead:

```typescript
import { suspend, useScope, type Operation } from "effection";

function* listen(): Operation<void> {
  let scope = yield* useScope();
  let unsubscribe = emitter.on("data", (event) =>
    scope.run(() => handle(event)),
  );
  try {
    yield* suspend();
  } finally {
    unsubscribe(); // synchronous, so a finally block is correct here
  }
}
```

### Non-Compliant: createScope() without destroy

```typescript
// BAD: nothing can ever tear this scope down
let [scope] = createScope(global);
scope.run(main);
```

### Non-Compliant: Returning a Task from a helper

```typescript
// BAD: hands the caller a Task, so the work is no longer the caller's child
function durably<T>(operation: () => Operation<T>): Task<T> {
  let [scope] = createScope(global); // BAD: detached from the caller
  return scope.run(operation); // BAD: return Operation<T> and let the caller spawn()
}
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] All `spawn()` calls are yielded (`yield* spawn(...)`)
- [ ] Promises are wrapped with `until()` for scope integration
- [ ] Fetch calls use `useAbortSignal()` for cancellation
- [ ] Resources have teardown — `finally` for sync cleanup, `ensure()` when it yields
- [ ] No `finally` block in the diff contains `yield*`
- [ ] No fire-and-forget `void asyncFn()` patterns
- [ ] No `createScope()` inside an operation — inherit with `useScope()` instead
- [ ] Every `createScope()` sits at an integration boundary, destructures `[scope, destroy]`, and binds `destroy` to that boundary's lifetime
- [ ] Scope isolation uses `Context.with()`, `scoped()`, or `resource()` — whichever is narrowest
- [ ] Helpers return `Operation<T>`, not `Task<T>`

## Common Mistakes

| Mistake                         | Fix                                              |
| ------------------------------- | ------------------------------------------------ |
| `spawn(op)` without yield       | `yield* spawn(op)` to attach to scope            |
| `await fetch(url)` in operation | `yield* until(fetch(url, { signal }))`           |
| `setTimeout` without cleanup    | Use `sleep()` or wrap with `useAbortSignal()`    |
| Sync cleanup in `try` block     | Move to `finally` block for halt safety          |
| `yield*` inside a `finally`     | Move it into `ensure()` — the halt is lost       |
| `createScope()` inside an operation | Inherit with `useScope()`; isolate with `Context.with()`, `scoped()`, or `resource()` |
| `scoped()` + `scope.set()` for one value | `Context.with(value, operation)`             |
| `scoped()` for a lifecycle object | `resource()` with `provide()`                  |
| Returning `Task<T>` from a helper | Return `Operation<T>` and let the caller `spawn()` |
| `let [scope] = createScope(...)` | Destructure `destroy` too, bound to the boundary's lifetime |

## Related Policies

- [No-Sleep Test Synchronization](./no-sleep-test-sync.md) - Deterministic test patterns for structured concurrency
- [Async Teardown](./async-teardown.md) - Cleanup that yields belongs in `ensure()`
- [Stateless Stream Operations](./stateless-streams.md) - Deferred execution pattern
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
