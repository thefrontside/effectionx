# fetch

Effection-native fetch with structured concurrency and streaming response support.

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
  let response = yield* fetch("https://api.example.com/users");
  let users = yield* response.json();
  console.log(users);
});
```

### Streaming response bodies

```ts
import { each } from "effection";
import { fetch } from "@effectionx/fetch";

function* example() {
  let response = yield* fetch("https://example.com/large-file.bin");

  for (let chunk of yield* each(response.body())) {
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
    fetch("https://api.example.com/users"),
    fetch("https://api.example.com/posts"),
    fetch("https://api.example.com/comments"),
  ]);

  return {
    users: yield* users.json(),
    posts: yield* posts.json(),
    comments: yield* comments.json(),
  };
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
  let response = yield* fetch("https://api.example.com/user");
  return yield* response.json(parseUser);
}
```

### Handle non-2xx responses

```ts
import { HttpError, fetch } from "@effectionx/fetch";

function* getUser(id: string) {
  try {
    let response = yield* fetch(`https://api.example.com/users/${id}`);
    yield* response.ensureOk();
    return yield* response.json();
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

Performs an HTTP request and returns an `Operation<FetchResponse>`.

- Automatically wires cancellation to the current Effection scope via `useAbortSignal()`.
- Merges `init.signal` with the scope signal using `AbortSignal.any()`.

### `FetchResponse`

Effection wrapper around native `Response` with operation-based body readers.

- `json<T>()`, `json<T>(parse)`
- `text()`
- `arrayBuffer()`
- `blob()`
- `formData()`
- `body(): Stream<Uint8Array, void>`
- `ensureOk()` throws `HttpError` for non-2xx responses
- `clone()` returns another `FetchResponse` wrapper
- `raw` gives access to the underlying native `Response`
