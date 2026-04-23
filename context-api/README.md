# Context APIs

Algebraic effects pattern for context-dependent operations with middleware

---

Often called "Algebraic Effects" or "Contextual Effects", Context APIs let you
access an operation via the context in a way that it can be easily (and
contextually) wrapped with middleware. Middleware is powered by
[`@effectionx/middleware`](../middleware/README.md) and supports min/max priority
ordering.

## Quick Start

Let's say that you want to define a log operation that behaves differently in
different contexts. The basic form will just log values to the console.

```ts
import { createApi } from "@effectionx/context-api";

export const logging = createApi("logging", {
  *log(...values: unknown[]) {
    console.log(...values);
  },
});

export const { log } = logging.operations;
```

Now you can use the logging API wherever you want:

```ts
import { log } from "./logging.ts";

export function* op() {
  yield* log("I am in an operation");
}
```

## Wrapping with Middleware

Use the `around` function to wrap middleware around your operations. This lets
you intercept calls, transform arguments, modify return values, or replace
the implementation entirely.

```ts
import { logging } from "./logging.ts";

function* initCustomLogging(externalLogger: { log(...values: unknown[]): void }) {
  yield* logging.around({
    *log([...values], next) {
      externalLogger.log(...values);
      // since we override the logger entirely, we do not invoke next
    },
  });
}
```

Middleware is only in effect inside the scope in which it is installed — when
the scope exits, the middleware is removed.

## Min/Max Priority

By default, `createApi()` configures two middleware groups:

```ts
[
  { name: "max", mode: "append" },
  { name: "min", mode: "prepend" },
]
```

`around()` registers into `"max"` priority (outermost, closest to the caller)
when no `at` is passed. You can also register at `"min"` priority (innermost,
closest to the core handler) by passing an options argument:

```ts
import { createApi } from "@effectionx/context-api";
import type { Operation } from "effection";

export const files = createApi("files", {
  *readFile(path: string): Operation<string> {
    throw new Error(`readFile("${path}") is not implemented`);
  },
});

export const { readFile } = files.operations;
```

In your runtime setup, provide the implementation via `min`:

```ts
import { files } from "./files.ts";

function* initNodeRuntime() {
  yield* files.around(
    {
      *readFile([path], _next) {
        return yield* nodeReadFile(path);
      },
    },
    { at: "min" },
  );
}
```

`max` middlewares wrap the outside as usual — they don't care which `min` is
providing the actual implementation:

```ts
import { files } from "./files.ts";

function* withLogging() {
  yield* files.around({
    *readFile([path], next) {
      console.log(`reading ${path}`);
      return yield* next(path);
    },
  });
}
```

In tests, swap the implementation by registering a different `min`:

```ts
function* useTestFixtures(fixtures: Map<string, string>) {
  yield* files.around(
    {
      *readFile([path], _next) {
        return fixtures.get(path) ?? "";
      },
    },
    { at: "min" },
  );
}
```

The execution order with max middlewares `[M1, M2]` and min middlewares
`[m1, m2]` is:

```text
M1 → M2 → m1 → m2 → core
```

## Custom groups

The two-lane default is the right shape for most APIs, but an API can declare
its own ordered list of middleware groups when more than two structural lanes
are needed. Each group has a `name` and a `mode`:

- **`"append"`** — earlier registrations run outer. Matches the default
  `"max"` behavior. Across scopes: parent-outer / child-inner.
- **`"prepend"`** — later registrations run outer. Matches the default
  `"min"` behavior. Across scopes: child-outer / parent-inner.

For example, a replay system may need a third lane that sits structurally
between general wrappers and core-providing middleware:

```ts
const effects = createApi("effects", handler, {
  groups: [
    { name: "max", mode: "append" },
    { name: "replay", mode: "append" },
    { name: "min", mode: "prepend" },
  ] as const,
});

yield* effects.around(loggingAndOtherWrappers, { at: "max" });
yield* effects.around(replayRestore, { at: "replay" });
yield* effects.around(defaultImplementations, { at: "min" });
yield* effects.around(dispatchOverrides, { at: "min" });
```

Execution order follows the declared group order, group by group, then the
core handler:

```text
max → replay → min → core
```

Passing `groups: [...] as const` lets TypeScript infer the literal union of
group names, so `around(..., { at })` is type-checked against the declared
set. `createApi()` throws at call time if `groups` is empty or has duplicate
names; `around()` throws at runtime if `at` names a group that was not
declared.

Default `at` is the first declared group. For the built-in configuration that
is `"max"`, so existing callers keep their behavior.

## Instrumentation

Middleware can be useful for automatic instrumentation:

```ts
import { fetching } from "./fetching.ts";

function* instrumentFetch(tracer) {
  yield* fetching.around({
    *fetch(args, next) {
      try {
        tracer.begin("fetch", args);
        return yield* next(...args);
      } finally {
        tracer.end("fetch", args);
      }
    },
  });
}
```

## Test Mocking

Mock operations in test cases without changing the call site:

```ts
import { fetching } from "./fetching.ts";

function* useMocks() {
  yield* fetching.around({
    *fetch([url, ...rest], next) {
      if (url === "/my-path") {
        return new MockResponse("my-path");
      } else {
        return yield* next(url, ...rest);
      }
    },
  });
}
```

## Scope Isolation

Middleware installed in a child scope does not affect the parent:

```ts
import { scoped } from "effection";
import { log, logging } from "./logging.ts";

function* example() {
  yield* scoped(function* () {
    yield* logging.around({
      *log([...values], next) {
        // only active inside this scope
        return yield* next(...values);
      },
    });
    yield* log("intercepted"); // middleware runs
  });

  yield* log("not intercepted"); // middleware does not run
}
```

## API

### `createApi(name, handler, options?)`

Create a context API from a name and an object of handler functions or
operations. Returns an object with `operations` and `around`.

The optional `options.groups` argument declares the middleware lanes this API
exposes. Each group has a `name` and a `mode` of `"append"` or `"prepend"`.
When omitted, it defaults to
`[{ name: "max", mode: "append" }, { name: "min", mode: "prepend" }]`.

```ts
import { createApi } from "@effectionx/context-api";
import type { Operation } from "effection";

const math = createApi("math", {
  *add(left: number, right: number): Operation<number> {
    return left + right;
  },
});

const { add } = math.operations;

function* example(): Operation<void> {
  const result = yield* add(1, 2); // => 3
}
```

### `around(middlewares, options?)`

Register middleware around one or more operations. The second argument chooses
which declared group to register into.

For the default configuration:

- **`{ at: "max" }`** (default) — outermost, closest to the caller
- **`{ at: "min" }`** — innermost, closest to the core handler

For APIs that declare custom groups, `at` accepts any declared group name and
defaults to the first declared group. Passing an unknown name throws at
runtime.

```ts
function* example() {
  // Wrapping middleware (max, default)
  yield* math.around({
    *add(args, next) {
      console.log("adding", args);
      return yield* next(...args);
    },
  });

  // Implementation middleware (min)
  yield* math.around(
    {
      *add([left, right], _next) {
        return left * right; // replace the core implementation
      },
    },
    { at: "min" },
  );
}
```

Each middleware receives the arguments as a tuple and a `next` function to
delegate to the next middleware (or the core handler). A middleware can:

- **Pass through**: call `next(...args)` and return its result
- **Transform arguments**: call `next()` with different arguments
- **Transform the return value**: modify what `next()` returns
- **Short-circuit**: return a value without calling `next()` at all
