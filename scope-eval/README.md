# @effectionx/scope-eval

Evaluate Effection operations in an isolated scope and inspect their side effects.

---

## Usage

### useEvalScope

Create an isolated scope that can evaluate operations and expose their side effects (like context values):

```typescript
import { main, createContext } from "effection";
import { useEvalScope } from "@effectionx/scope-eval";

await main(function*() {
  const context = createContext<string>("my-context");

  const evalScope = yield* useEvalScope();

  // Context not set yet
  evalScope.scope.get(context); // => undefined

  // Evaluate an operation that sets context
  yield* evalScope.eval(function*() {
    yield* context.set("Hello World!");
  });

  // Now the context is visible via the scope
  evalScope.scope.get(context); // => "Hello World!"
});
```

### Error Handling

Operations are executed safely and return a `Result<T>`:

```typescript
import { main } from "effection";
import { useEvalScope } from "@effectionx/scope-eval";

await main(function*() {
  const evalScope = yield* useEvalScope();

  const result = yield* evalScope.eval(function*() {
    throw new Error("something went wrong");
  });

  if (result.ok) {
    console.log("Success:", result.value);
  } else {
    console.log("Error:", result.error.message);
  }
});
```

### box / unbox

Utilities for capturing operation results as values:

```typescript
import { main } from "effection";
import { box, unbox } from "@effectionx/scope-eval";

await main(function*() {
  // Capture success or error as a Result
  const result = yield* box(function*() {
    return 42;
  });

  // Extract value (throws if error)
  const value = unbox(result); // => 42
});
```

## API

### `useEvalScope(): Operation<EvalScope>`

Creates an isolated scope for evaluating operations.

Returns an `EvalScope` with:
- `scope: Scope` - The underlying Effection scope for inspecting context
- `eval<T>(op: () => Operation<T>): Operation<Result<T>>` - Evaluate an operation

### `box<T>(content: () => Operation<T>): Operation<Result<T>>`

Execute an operation and capture its result (success or error) as a `Result<T>`.

### `unbox<T>(result: Result<T>): T`

Extract the value from a `Result<T>`, throwing if it's an error.

## Use Cases

- **Testing**: Evaluate operations in isolation and verify context/state changes
- **Error boundaries**: Safely execute operations that might fail
- **Scope inspection**: Access context values set by child operations
