# Scope-Bound Event Registration Policy (Recommended)

This document defines the recommended policy for registering event listeners on
emitters (Node `EventEmitter`, streams, `EventTarget`) inside Effection code.

## Core Principle

**An event listener's lifetime must depend solely on a scope, never on its event
firing.**

## The Rule

| Case / Condition                                        | Required behavior                                                        |
| ------------------------------------------------------- | ------------------------------------------------------------------------ |
| Registering any listener                                | Use `.on()` / `.addEventListener()` with a **named** handler             |
| `emitter.once(...)` or `{ once: true }`                 | Never; convert to `.on()` plus scope-bound removal                       |
| Removing the listener                                   | `.off()` in the scope's own teardown (`finally` for sync-only, `ensure()` otherwise) |
| Teardown waits on a value the listener resolves         | Deregister **after** that wait, in the same `ensure()`                   |

The `once()` *operation* from `@effectionx/node/events` is compliant and
unaffected: it removes its listener when its scope exits, whether or not the
event ever fired. This policy is about `EventEmitter.prototype.once` and the
`{ once: true }` listener option.

### Why

`emitter.once()` deregisters the hook only when the event fires. If the event
never fires — the process never errors, the stream is destroyed instead of
ending, the scope is halted first — the listener outlives the scope that
created it. On emitters shared beyond a single owner (I/O pipes are the
canonical case: a child's stdio may be inherited by descendants and observed by
more than one consumer) the leaked listener keeps firing into a dead scope,
resolving resolvers nobody is waiting on and holding referenced objects alive.

Symmetric registration and removal on scope entry and exit makes listener
lifetime deterministic — the same principle
[Structured Concurrency](./structured-concurrency.md) applies to tasks, applied
to event hooks.

## Examples

### Compliant: named handlers, removed in the scope's teardown

```typescript
function useConnection(url: string): Operation<Connection> {
  return resource(function* (provide) {
    let socket = connect(url);
    let onMessage = (message: Message) => inbox.send(message);
    socket.on("message", onMessage);
    try {
      yield* provide(ConnectionHandle(socket));
    } finally {
      socket.off("message", onMessage); // sync-only: `finally` is fine
    }
  });
}
```

### Compliant: teardown waits on a listener-resolved value first

```typescript
function useChildProcess(create: () => ChildProcess): Operation<NativeProcess> {
  return resource(function* (provide) {
    let result = withResolvers<Result<ExitStatus>>();
    let child: ChildProcess | undefined;

    let onClose = (code: number | null) => result.resolve(Ok(ExitStatus(code)));

    yield* ensure(function* () {
      if (child) {
        yield* result.operation; // needs `onClose` still attached
        child.off("close", onClose); // removal ordered after the wait
      }
    });

    child = create();
    child.on("close", onClose);
    yield* provide(NativeProcess(child, result.operation));
  });
}
```

### Non-Compliant: `once()` ties removal to the event firing

```typescript
child.once("error", (error) => {
  result.resolve(Err(error)); // VIOLATION: if "error" never fires, the
}); //                           listener outlives the scope
```

### Non-Compliant: registered but never removed

```typescript
stream.on("data", (chunk) => signal.send(chunk)); // VIOLATION: no `.off()` on
yield* provide(handle); //                           any teardown path; leaks on
//                                                   emitters shared beyond this scope
```

## Verification Checklist

Before marking a review complete, verify:

- [ ] No `emitter.once(...)` or `{ once: true }` registration in the diff
- [ ] Every `.on()` / `.addEventListener()` has a named handler and a matching
      `.off()` / `.removeEventListener()` on a teardown path of the same scope
- [ ] Removal that follows a `yield*` lives in `ensure()`, not `finally`
      (see [Async Teardown](./async-teardown.md))
- [ ] When teardown awaits a listener-resolved value, removal comes after the wait

## Common Mistakes

| Mistake                                                      | Fix                                                                 |
| ------------------------------------------------------------ | ------------------------------------------------------------------- |
| `emitter.once("close", handler)`                             | `emitter.on("close", handler)` + `.off()` in the scope's teardown   |
| Anonymous inline listener                                    | Name it — `.off()` needs the same function reference                |
| `.off()` in a `finally` while an `ensure()` still awaits the event | Move removal into that `ensure()`, after the wait             |
| Skipping removal because "the emitter dies with the process" | Remove anyway; the emitter may be shared beyond this scope          |

## Related Policies

- [Async Teardown](./async-teardown.md) - Where removal may live: `finally` only if sync-only
- [Structured Concurrency](./structured-concurrency.md) - The same lifetime principle, for tasks
- [Correctness Through Explicit Invariants](./correctness-invariants.md) - The never-fires path must be considered
- [Policies Index](./index.md) - Add your new policy to the Policy Documents table
