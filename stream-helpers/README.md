# Stream Helpers

A collection of type-safe stream helpers built on top of
[Effection](https://github.com/thefrontside/effection) for efficient and
controlled stream processing.

## Features

### Batch

The `batch` helper is useful when you want to convert individual items passing
through the stream into arrays of items. The batches can be created either by
specifying a maximum time or a maximum size. If both are specified, the batch
will be created when either condition is met.

```typescript
import { batch } from "@effectionx/stream-helpers";
import { each, run } from "effection";

// Example: Batch by size
await run(function* () {
  const stream = batch({ maxSize: 3 })(sourceStream);

  for (const items of yield* each(stream)) {
    console.log(batch); // [1, 2, 3], [4, 5, 6], ...
    yield* each.next();
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

Allows to apply backpressure to the source stream to prevent overwhelming the
downstream consumer. This is useful with any stream that generates items faster
than the consumer can consume them. It was originally designed for use with
Kafka where the producer can cause the service to run out of memory when the
producer produces many faster than the consumer to process the messages. It can
be used as a buffer for any infinite stream.

```typescript
import { valve } from "@effectionx/stream-helpers";
import { each, run } from "effection";

await run(function* () {
  const stream = valve({
    // buffer size threshold when close operation will invoked
    closeAt: 1000,
    *close() {
      // pause the source stream
    },

    // buffer size threshold when open operation will be invoked
    openAt: 100,
    *open() {
      // resume the source stream
    },
  })(sourceStream);

  for (const value of yield* each(stream)) {
    console.log(value);
    yield* each.next();
  }
});
```

### Composing stream helpers

You can use a simple `pipe()` to compose a series of stream helpers together. In
this example, we use one from [remeda](https://remedajs.com/docs/#pipe),

```typescript
import { valve } from "@effectionx/stream-helpers";
import { each, run } from "effection";
// any standard pipe function should work
import { pipe } from "remeda";

await run(function* () {
  // Compose stream helpers using pipe
  const stream = pipe(
    source,
    valve({ open, close, openAt: 100, closeAt: 100 }),
    batch({ maxSize: 50 }),
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

### Valve Operation

- Implementing backpressure in data pipelines
- Controlling memory usage in high-throughput systems
- Rate limiting stream processing
