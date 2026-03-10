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

```text
M1 → M2 → m1 → m2 → core
```

## When to Use Min vs Max

The two priority levels serve fundamentally different roles:

**`max` (outermost) — wrapping behavior.** This is the most common middleware
use case. Logging, timing, caching, auth, transactions — behaviors that wrap
around an operation. `max` middlewares always call `next()` to delegate inward,
and there are typically multiple of them layered on top of each other.

**`min` (innermost) — providing implementation.** The core function is often a
stub that throws "not implemented." A `min` middleware supplies the actual
behavior for your runtime or environment. It typically does **not** call
`next()` — it *is* the implementation.

This separation lets you define an operation as a contract and defer the
implementation:

```ts
import { createMiddlewareStack } from "@effectionx/middleware";
import type { Operation } from "effection";

// Define the contract — core throws because there's no implementation yet
const readFile = createMiddlewareStack<[string], Operation<string>>();

// In your Node.js runtime setup, provide the implementation via min:
readFile.use(function* ([path], _next) {
  return yield* nodeReadFile(path);
}, { at: "min" });

// Max middlewares wrap the outside as usual:
readFile.use(function* ([path], next) {
  console.log(`reading ${path}`);
  return yield* next(path);
});

// Compose with a core that throws if no min is registered
const read = readFile.compose((path) => {
  throw new Error(`readFile("${path}") is not implemented`);
});
```

In tests, you can swap the implementation by registering a different `min`:

```ts
readFile.use(function* ([path], _next) {
  return testFixtures.get(path) ?? "";
}, { at: "min" });
```

The `max` middlewares (logging, caching, etc.) continue to work unchanged — they
don't care which `min` is providing the actual file reading.

## With Effection Operations

The middleware pattern becomes especially powerful when combined with
[Effection](https://frontside.com/effection) operations. When `TReturn` is an
`Operation`, each middleware is a generator function whose body **is** the
execution context for everything inside it.

With plain function middleware, each layer can only transform arguments and
return values — "args in, result out." But with Effection, a middleware generator
can `yield*` to set up resources, establish context, or spawn tasks before
calling `next()`. Everything below it in the stack — every inner middleware and
the core function — automatically inherits that context without receiving it as a
parameter.

The running coroutine *is* the context for future execution.

```ts
import { createMiddlewareStack } from "@effectionx/middleware";
import type { Middleware } from "@effectionx/middleware";
import type { Operation } from "effection";
import { createContext } from "effection";

type Handler = Middleware<[Request], Operation<Response>>;

const DatabaseConnection = createContext<Connection>("database");
const CurrentUser = createContext<User>("user");

// Middleware 1: establish a database connection for the request
const withDatabase: Handler = function* (args, next) {
  const conn = yield* connect(process.env.DATABASE_URL);
  yield* DatabaseConnection.set(conn);
  try {
    return yield* next(...args);
  } finally {
    yield* conn.close();
  }
};

// Middleware 2: wrap the entire request in a transaction
const withTransaction: Handler = function* (args, next) {
  const conn = yield* DatabaseConnection.expect();
  const tx = yield* conn.begin();
  try {
    const response = yield* next(...args);
    yield* tx.commit();
    return response;
  } catch (error) {
    yield* tx.rollback();
    throw error;
  }
};

// Middleware 3: authenticate and set user context
const withAuth: Handler = function* ([request], next) {
  const conn = yield* DatabaseConnection.expect();
  const user = yield* authenticate(request, conn);
  yield* CurrentUser.set(user);
  return yield* next(request);
};
```

The core handler uses all of this context — but never receives any of it as
parameters:

```ts
function* handleRequest(request: Request): Operation<Response> {
  const user = yield* CurrentUser.expect();
  const conn = yield* DatabaseConnection.expect();

  const posts = yield* conn.query(
    "SELECT * FROM posts WHERE author = ?",
    [user.id],
  );

  return Response.json(posts);
}
```

Compose it all together:

```ts
const stack = createMiddlewareStack<[Request], Operation<Response>>();

stack.use(withDatabase);
stack.use(withTransaction);
stack.use(withAuth);

const handle = stack.compose(handleRequest);
```

Each middleware's generator is still **running** while the inner functions
execute. `withDatabase` holds the connection open, `withTransaction` holds the
transaction open, and `withAuth` has set the user context. When `handleRequest`
returns (or throws, or is cancelled), the stack unwinds in reverse:
`withAuth` → `withTransaction` (commit or rollback) → `withDatabase` (close
connection). Structured concurrency guarantees that no resources leak, even if
the request is cancelled mid-flight.

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
