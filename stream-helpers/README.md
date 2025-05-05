# Stream Helpers

A collection of type-safe stream helpers built on top of
[Effection](https://github.com/thefrontside/effection) for efficient and
controlled stream processing.

## Features

### Batch

The `batch` operation groups stream items into batches based on size and/or time
constraints.

```typescript
import { batch } from "@effectionx/stream-helpers";
import { each, run } from "effection";

// Example: Batch by size
await run(function* () {
  const stream = batch({ maxSize: 3 })(sourceStream);

  for (const items of yield* each(stream)) {
    console.log(batch); // [1, 2, 3], [4, 5, 6], ...
  }
});

// Example: Batch by time
await run(function* () {
  const stream = batch({ maxTime: 1000 })(sourceStream);

  for (const batch of yield* each(stream)) {
    console.log(batch); // Items received within 1 second
    yield* each.next();
  }
});

// Example: Combined batching
await run(function* () {
  const stream = batch({
    maxSize: 5,
    maxTime: 1000,
  })(sourceStream);

  for (const batch of yield* each(stream)) {
    console.log(batch); // Up to 5 items within 1 second
    yield* each.next();
  }
});
```

### Valve

The `valve` operation controls stream flow based on buffer size thresholds.

```typescript
import { valve } from "@effectionx/stream-helpers";
import { each, run } from "effection";

await run(function* () {
  const stream = valve({
    openAt: 2, // Open valve when buffer size <= 2
    closeAt: 5, // Close valve when buffer size >= 5
    open() {
      console.log("Valve opened");
    },
    close() {
      console.log("Valve closed");
    },
  })(sourceStream);

  for (const value of yield* each(stream)) {
    console.log(value);
    yield* each.next();
  }
});
```

### Composing stream helpers 

You can use a simple `pipe()` to compose a series of stream helpers together. In this example, we use one from `ramda`, 

```typescript
import { valve } from "@effectionx/stream-helpers";
import { each, run } from "effection";
// any standard pipe function should work
import { pipe } from "ramda";

await run(function* () {
  // Compose stream helpers using pipe
  const stream = pipe(
    source,
    valve({ open, close, openAt: 2, closeAt: 5 }),
    batch({ maxSize: 3 }),
  );

  for (const value of yield* each(stream)) {
    console.log(value);
    yield* each.next();
  }
});
```

## Use Cases

### Batch Operation

- Grouping API requests to reduce network overhead
- Buffering database operations for bulk inserts
- Collecting metrics before processing

### Valve Operation

- Implementing backpressure in data pipelines
- Controlling memory usage in high-throughput systems
- Rate limiting stream processing

## Composing with Pipe

Stream operations can be composed using the `pipe` function from libraries like
`remeda`:
