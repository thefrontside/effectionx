# fetch

Effection-native fetch with structured concurrency and streaming response support.

> **Note**: Starting with version 0.2.0, this package requires Effection v4.1 or greater
> for full functionality. The middleware/API features (`fetchApi`) require the new
> `createApi` function introduced in Effection v4.1.

---

## Installation

```bash
npm install @effectionx/fetch effection
```

## Usage

```ts
import { main } from "effection";
import { fetch } from "@effectionx/fetch";

await main(function* () {
  let users = yield* fetch("https://api.example.com/users").json();
  console.log(users);
});
```

### Fluent API

Chain methods directly on `fetch()` for concise one-liners:

```ts
// JSON
let data = yield* fetch("https://api.example.com/users").json();

// Text
let html = yield* fetch("https://example.com").text();

// With validation - throws HttpError on non-2xx
let data = yield* fetch("https://api.example.com/users").expect().json();
```

### Traditional API

You can also get the response first, then consume the body:

```ts
let response = yield* fetch("https://api.example.com/users");
let data = yield* response.json();
```

### Streaming response bodies

```ts
import { each } from "effection";
import { fetch } from "@effectionx/fetch";

function* example() {
  for (let chunk of yield* each(fetch("https://example.com/large-file.bin").body())) {
    console.log(chunk.length);
    yield* each.next();
  }
}
```

### Concurrent requests

```ts
import { all } from "effection";
import { fetch } from "@effectionx/fetch";

function* fetchMultiple() {
  let [users, posts, comments] = yield* all([
    fetch("https://api.example.com/users").json(),
    fetch("https://api.example.com/posts").json(),
    fetch("https://api.example.com/comments").json(),
  ]);

  return { users, posts, comments };
}
```

### Validate JSON while parsing

```ts
import { fetch } from "@effectionx/fetch";

interface User {
  id: string;
  name: string;
}

function parseUser(value: unknown): User {
  if (
    typeof value === "object" &&
    value !== null &&
    "id" in value &&
    "name" in value
  ) {
    return value as User;
  }

  throw new Error("invalid user payload");
}

function* getUser() {
  return yield* fetch("https://api.example.com/user").json(parseUser);
}
```

### Handle non-2xx responses

```ts
import { HttpError, fetch } from "@effectionx/fetch";

function* getUser(id: string) {
  try {
    return yield* fetch(`https://api.example.com/users/${id}`).expect().json();
  } catch (error) {
    if (error instanceof HttpError) {
      console.error(error.status, error.statusText);
    }
    throw error;
  }
}
```

## API

### `fetch(input, init?)`

Returns a `FetchOperation` that supports both fluent chaining and traditional usage.

- `input` - URL string, `URL` object, or `Request` object
- `init` - Optional `FetchInit` options (same as `RequestInit` but without `signal`)

Cancellation is handled automatically via Effection's structured concurrency. When the
scope exits, the request is aborted. The `signal` option is intentionally omitted since
Effection manages cancellation for you.

### `FetchOperation`

Chainable fetch operation returned by `fetch()`.

- `json<T>()`, `json<T>(parse)` - parse response as JSON
- `text()` - get response as text
- `arrayBuffer()` - get response as ArrayBuffer
- `blob()` - get response as Blob
- `formData()` - get response as FormData
- `body()` - stream response body as `Stream<Uint8Array, void>`
- `expect()` - returns a new `FetchOperation` that throws `HttpError` on non-2xx

Can also be yielded directly to get a `FetchResponse`:

```ts
let response = yield* fetch("https://api.example.com/users");
```

### `FetchResponse`

Effection wrapper around native `Response` with operation-based body readers.

- `json<T>()`, `json<T>(parse)`
- `text()`
- `arrayBuffer()`
- `blob()`
- `formData()`
- `body(): Stream<Uint8Array, void>`
- `expect()` - throws `HttpError` for non-2xx responses
- `raw` - access the underlying native `Response`

### `fetchApi`

The fetch API object that supports middleware decoration. Use `fetchApi.around()`
to add middleware for logging, mocking, or instrumentation.

```ts
import { fetchApi, fetch } from "@effectionx/fetch";
import { run } from "effection";

// Add logging middleware
await run(function* () {
  yield* fetchApi.around({
    *fetch(args, next) {
      let [input] = args;
      console.log("Fetching:", input);
      return yield* next(...args);
    },
  });

  // All fetch calls in this scope now log
  let data = yield* fetch("/api/users").json();
});
```

#### Mocking responses for testing

```ts
import { fetchApi, fetch, createMockResponse } from "@effectionx/fetch";
import { run } from "effection";

await run(function* () {
  yield* fetchApi.around({
    *fetch(args, next) {
      let [input] = args;
      if (String(input).includes("/api/users")) {
        // Return a mock FetchResponse
        return createMockResponse({ users: [] });
      }
      return yield* next(...args);
    },
  });

  // This returns mocked data in this scope
  let users = yield* fetch("/api/users").json();
});
```

Middleware is scoped - it only applies to the current scope and its children,
and is automatically cleaned up when the scope exits.
