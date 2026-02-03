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
import { box } from "@effectionx/result";

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
import { unbox, Ok, Err } from "@effectionx/result";

const success = Ok("hello");
const value = unbox(success); // "hello"

const failure = Err(new Error("oops"));
unbox(failure); // throws Error("oops")
```

### Ok / Err / Result

Re-exported from `effection` for convenience:

```typescript
import { Ok, Err, type Result } from "@effectionx/result";

function divide(a: number, b: number): Result<number> {
  if (b === 0) {
    return Err(new Error("Division by zero"));
  }
  return Ok(a / b);
}
```

## API

### `box<T>(content: () => Operation<T>): Operation<Result<T>>`

Wraps an operation and returns `Ok(value)` on success or `Err(error)` on failure.

### `unbox<T>(result: Result<T>): T`

Extracts the value from an `Ok` result or throws the error from an `Err` result.

### `Ok<T>(value: T): Result<T>`

Creates a successful result containing the value.

### `Err<T>(error: Error): Result<T>`

Creates a failed result containing the error.

### `Result<T>`

A discriminated union type: `{ ok: true; value: T } | { ok: false; error: Error }`
