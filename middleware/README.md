# Middleware

Composable middleware with min/max priority layering for wrapping a single
function.

---

Middleware lets you wrap any function with a chain of interceptors that can
inspect arguments, transform return values, or short-circuit execution entirely.
It uses a min/max priority system so you can control which middleware runs
closest to the caller and which runs closest to the core function.

## Quick Start

```ts
import { createMiddlewareStack } from "@effectionx/middleware";

const stack = createMiddlewareStack<[number, number], number>();

// Log every call (runs outermost by default)
stack.use((args, next) => {
  console.log("adding", args);
  const result = next(...args);
  console.log("result", result);
  return result;
});

// Double the result (also outermost, runs after logger)
stack.use((args, next) => next(...args) * 2);

const add = stack.compose((a, b) => a + b);

add(3, 4);
// adding [3, 4]
// result 14
// => 14
```

## Min/Max Priority

Every middleware is registered at either `"max"` (default) or `"min"` priority:

- **`max`** runs outermost, closest to the caller
- **`min`** runs innermost, closest to the core function

This gives you explicit control over ordering without worrying about insertion
sequence across different call sites.

```ts
const stack = createMiddlewareStack<[string], string>();

stack.use((args, next) => {
  console.log("max runs first");
  return next(...args);
});

stack.use((args, next) => {
  console.log("min runs just before core");
  return next(...args);
}, { at: "min" });

const fn = stack.compose((s) => s.toUpperCase());
fn("hello");
// max runs first
// min runs just before core
// => "HELLO"
```

The full execution order with max middlewares `[M1, M2]` and min middlewares
`[m1, m2]` is:

```
M1 → M2 → m1 → m2 → core
```

## API

### `Middleware<TArgs, TReturn>`

The type of a single middleware function. It receives the arguments as a tuple
and a `next` function to delegate to the next middleware (or the core function).

```ts
import type { Middleware } from "@effectionx/middleware";

const timer: Middleware<[string], string> = (args, next) => {
  const start = performance.now();
  const result = next(...args);
  console.log(`took ${performance.now() - start}ms`);
  return result;
};
```

A middleware can:

- **Pass through**: call `next(...args)` and return its result
- **Transform arguments**: call `next()` with different arguments
- **Transform the return value**: modify what `next()` returns
- **Short-circuit**: return a value without calling `next()` at all

### `combine(middlewares)`

Compose an array of middleware into a single middleware. Middlewares execute
left-to-right: the first in the array runs outermost.

```ts
import { combine } from "@effectionx/middleware";

const composed = combine([logger, validator, retry]);
const result = composed(["hello"], coreFn);
// Execution: logger → validator → retry → coreFn
```

### `createMiddlewareStack<TArgs, TReturn>()`

Create a middleware stack with min/max priority ordering.

```ts
import { createMiddlewareStack } from "@effectionx/middleware";

const stack = createMiddlewareStack<[Request], Response>();

stack.use(loggingMiddleware);
stack.use(authMiddleware, { at: "min" });

const handler = stack.compose(coreHandler);
```

- **`use(middleware, options?)`** — register middleware. `options.at` defaults to
  `"max"`.
- **`compose(core)`** — returns a new function wrapping `core` with all
  registered middleware. Each call to `compose()` reflects the current state of
  the stack.
