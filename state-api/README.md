# State API

Reactive state container with typed reducers and middleware for Effection.

---

## Usage

### Basic state

```ts
import { run, each, spawn } from "effection";
import { useState } from "@effectionx/state-api";

await run(function* () {
  const counter = yield* useState(0);

  yield* counter.set(42);
  yield* counter.update((n) => n + 1);
  const value = yield* counter.get(); // 43
});
```

### Typed reducers

Define named state transitions that are type-safe and interceptable.

```ts
interface Todo {
  id: number;
  text: string;
  done: boolean;
}

const todos = yield* useState([] as Todo[], {
  add: (state, text: string) => [
    ...state,
    { id: state.length, text, done: false },
  ],
  toggle: (state, id: number) =>
    state.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
  remove: (state, id: number) => state.filter((t) => t.id !== id),
});

yield* todos.add("buy milk"); // returns the new state
yield* todos.toggle(0);
yield* todos.remove(0);

// built-in operations still available
yield* todos.set([]);
yield* todos.update((s) => [...s]);
const snapshot = yield* todos.get();
```

Each reducer is a function `(state, ...args) => newState`. The `state`
argument is injected automatically; callers pass only the remaining
arguments.

### Stream subscription

`State<T>` implements `Stream<T, void>`, so you can subscribe to changes:

```ts
yield* spawn(function* () {
  for (const snapshot of yield* each(todos)) {
    console.log("todos changed:", snapshot);
    yield* each.next();
  }
});
```

### Middleware

Every operation (`set`, `update`, `get`, and all reducer actions) can be
intercepted with middleware via `around()`:

```ts
// log every state change
yield* todos.around({
  *set([value], next) {
    console.log("replacing state:", value);
    return yield* next(value);
  },
  *add([text], next) {
    console.log("adding todo:", text);
    return yield* next(text);
  },
});

// validate state transitions
yield* counter.around({
  *set([value], next) {
    if (value < 0) throw new Error("counter cannot be negative");
    return yield* next(value);
  },
});

// modify arguments
yield* counter.around({
  *update([fn], next) {
    return yield* next((n) => Math.max(0, fn(n)));
  },
});
```

Middleware is scoped: it applies only within the current Effection scope
and is automatically removed when the scope exits.
