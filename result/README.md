# Result

Utilities for capturing operation results as values instead of exceptions.

---

## Installation

```bash
npm install @effectionx/result effection
```

## Usage

### box

Execute an operation and capture its result (success or error) as a `Result<T>`.

```typescript
import { box, unbox } from "@effectionx/result";

const result = yield* box(function* () {
  return yield* someOperation();
});

if (result.ok) {
  console.log("Success:", result.value);
} else {
  console.log("Error:", result.error);
}
```

### unbox

Extract the value from a `Result<T>`, throwing if it's an error.

```typescript
import { box, unbox } from "@effectionx/result";

const result = yield* box(function* () {
  return "hello";
});

const value = unbox(result); // "hello"
```

## API

### `box<T>(content: () => Operation<T>): Operation<Result<T>>`

Wraps an operation and returns `Ok(value)` on success or `Err(error)` on failure.

### `unbox<T>(result: Result<T>): T`

Extracts the value from an `Ok` result or throws the error from an `Err` result.
