# Middleware

Composable middleware for wrapping a single function

---

Middleware lets you wrap any function with a chain of interceptors that can
inspect arguments, transform return values, or short-circuit execution entirely.
The `combine()` function composes an array of middleware into a single
middleware, executing left-to-right.

## Quick Start

```ts
import { combine } from "@effectionx/middleware";
import type { Middleware } from "@effectionx/middleware";

const logger: Middleware<[number, number], number> = (args, next) => {
  console.log("adding", args);
  const result = next(...args);
  console.log("result", result);
  return result;
};

const doubler: Middleware<[number, number], number> = (args, next) =>
  next(...args) * 2;

const add = combine([logger, doubler]);

add([3, 4], (a, b) => a + b);
// adding [3, 4]
// result 14
// => 14
```

The composed middleware receives the arguments as a tuple and a core function.
Execution flows left-to-right through the array: `logger → doubler → core`.

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
import { combine } from "@effectionx/middleware";
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
const handle = combine([withDatabase, withTransaction, withAuth]);

function* processRequest(request: Request): Operation<Response> {
  return yield* handle([request], handleRequest);
}
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

The returned value is itself a `Middleware`, so it can be nested inside other
`combine()` calls or passed anywhere a middleware is expected.
