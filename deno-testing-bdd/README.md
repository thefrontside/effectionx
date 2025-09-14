# @effectionx/deno-testing-bdd

A BDD (Behavior-Driven Development) testing harness for Deno that integrates
seamlessly with [Effection](https://github.com/thefrontside/effection)
operations. This package provides a familiar `describe`/`it`/`beforeEach` API
that works natively with Effection's generator-based operations.

## Features

- 🔄 **Native Effection Support**: Test functions can be generator functions
  that yield operations
- 🏗️ **Familiar BDD API**: Uses the standard `describe`, `it`, and `beforeEach`
  functions you know and love
- 🧹 **Automatic Cleanup**: Proper resource management and cleanup for Effection
  operations
- 🎯 **Skip and Only**: Full support for `.skip` and `.only` modifiers
- 📦 **Zero Configuration**: Works out of the box with Deno's built-in testing
  framework

## Installation

Add to your `deno.json` imports:

```json
{
  "imports": {
    "@effectionx/deno-testing-bdd": "jsr:@effectionx/deno-testing-bdd"
  }
}
```

## Basic Usage

```typescript
import { beforeEach, describe, it } from "@effectionx/deno-testing-bdd";
import { expect } from "@std/expect";
import { sleep, spawn } from "effection";
import { createSignal, is } from "@effectionx/signals";

describe("My async operations", () => {
  let counter: ReturnType<typeof createSignal<number, void>>;

  beforeEach(function* () {
    // Setup that runs before each test
    counter = yield* createSignal(0);
    yield* sleep(10); // Can use Effection operations in setup
  });

  it("should increment counter", function* () {
    // Test function is a generator that can yield operations
    counter.update((n) => n + 1);
    yield* is(counter, (value) => value === 1);
    expect(counter.valueOf()).toBe(1);
  });
});
```

## Real-World Examples

The following packages have been migrated to use `@effectionx/deno-testing-bdd`
and provide excellent examples of testing patterns:

### Stream Operations

- **stream-helpers**: See
  [`for-each.test.ts`](../stream-helpers/for-each.test.ts) for testing stream
  processing with `forEach`
- **stream-helpers**: See [`batch.test.ts`](../stream-helpers/batch.test.ts) for
  testing stream batching with time and size limits
- **stream-helpers**: See [`filter.test.ts`](../stream-helpers/filter.test.ts)
  for testing async stream filtering
- **stream-helpers**: See [`map.test.ts`](../stream-helpers/map.test.ts) for
  testing stream transformations

### Signal Operations

- **signals**: See [`array.test.ts`](../signals/array.test.ts) for testing array
  signal operations like push, set, and update
- **signals**: See [`boolean.test.ts`](../signals/boolean.test.ts) for testing
  boolean signal state changes
- **signals**: See [`helpers.test.ts`](../signals/helpers.test.ts) for testing
  the `is` helper with signal predicates
- **signals**: See [`set.test.ts`](../signals/set.test.ts) for testing set
  signal operations

### Timed Operations

- **timebox**: See [`timebox.test.ts`](../timebox/timebox.test.ts) for testing
  timeout scenarios with both success and timeout cases
- **task-buffer**: See
  [`task-buffer.test.ts`](../task-buffer/task-buffer.test.ts) for testing task
  queuing and buffer management

### WebSocket Communication

- **websocket**: See [`websocket.test.ts`](../websocket/websocket.test.ts) for
  testing bidirectional WebSocket communication and connection lifecycle

### Worker Operations

- **worker**: See [`worker.test.ts`](../worker/worker.test.ts) for testing web
  worker communication, error handling, and lifecycle management

### Common Patterns Demonstrated

These test files show how to:

- **Handle async operations** without `run()` wrappers
- **Test error scenarios** using try/catch blocks instead of Promise rejections
- **Use `beforeEach`** for test setup with Effection operations
- **Wait for signal changes** using the `is` helper
- **Test resource cleanup** and proper teardown
- **Handle timeouts and concurrent operations**

## API Reference

### `describe(name: string, body: () => void)`

Creates a test suite with the given name. Test suites can be nested.

**Options:**

- `describe.skip()` - Skip this test suite
- `describe.only()` - Run only this test suite

### `it(desc: string, body?: () => Operation<void>)`

Creates a test case with the given description. The body function should be a
generator function that can yield Effection operations.

**Options:**

- `it.skip()` - Skip this test case
- `it.only()` - Run only this test case

**Parameters:**

- `desc` - Description of what the test should do
- `body` - Generator function containing the test logic (optional for pending
  tests)

### `beforeEach(body: () => Operation<void>)`

Registers a setup function that runs before each test in the current suite. The
body function should be a generator function that can yield Effection
operations.

### ~~`afterEach`~~

This package doesn't include `afterEach` because it's typically used for clean
up. With Effection, clean up is done in `finally` block of the resource.
Consider creating a resource in beforeEach if you encounter a need for
`afterEach`.

### `beforeAll`

Is not implemented yet.

## Migration from Standard Deno Testing

If you're migrating from standard Deno testing with Effection, the changes are
minimal:

**Before:**

```typescript
import { describe, it } from "@std/testing/bdd";
import { run } from "effection";

describe("my tests", () => {
  it("should work", async () => {
    await run(function* () {
      const result = yield* someOperation();
      expect(result).toBe("success");
    });
  });
});
```

**After:**

```typescript
import { describe, it } from "@effectionx/deno-testing-bdd";
// No need to import 'run'

describe("my tests", () => {
  it("should work", function* () {
    const result = yield* someOperation();
    expect(result).toBe("success");
  });
});
```

## Error Handling

The framework automatically handles errors in Effection operations and presents
them as test failures:

```typescript
describe("error handling", () => {
  it("should handle operation errors", function* () {
    try {
      yield* someOperationThatMightFail();
    } catch (error) {
      expect(error.message).toContain("expected error");
    }
  });
});
```

## Best Practices

1. **Use `beforeEach` for setup**: Initialize state and resources in
   `beforeEach` to ensure clean test isolation.

2. **Leverage Effection's resource management**: Use `spawn`, `resource`, and
   other Effection patterns for proper cleanup.

3. **Test async operations naturally**: Generator functions make testing async
   operations feel synchronous.

4. **Use descriptive test names**: Follow BDD conventions with clear,
   descriptive test descriptions.

5. **Group related tests**: Use nested `describe` blocks to organize related
   functionality.

6. **Handle errors explicitly**: Use try/catch blocks for testing error
   conditions rather than async rejection patterns.

## Integration with Standard Deno Testing

This package is built on top of Deno's standard testing framework
(`@std/testing/bdd`) and is fully compatible with:

- `deno test` command
- Test filtering and reporting
- VS Code Deno extension
- Other Deno testing tools

## Contributing

This package is part of the
[Effection](https://github.com/thefrontside/effection) ecosystem. Contributions
are welcome!
