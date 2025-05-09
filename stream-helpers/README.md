# Stream Helpers

A collection of type-safe stream helpers built on top of
[Effection](https://github.com/thefrontside/effection) for efficient and
controlled stream processing.

## Features

### Map

The `map` helper transforms each item in a stream using a provided function.
This is useful for data transformation operations where you need to process each
item individually.

```typescript
import { map } from "@effectionx/stream-helpers";
import { each, run } from "effection";

await run(function* () {
  const stream = map(function* (x: number) {
    return x * 2;
  })(sourceStream);

  for (const value of yield* each(stream)) {
    console.log(value); // Each value is doubled
    yield* each.next();
  }
});
```

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

## Testing Streams

The library includes testing utilities to help you test your stream processing
code. These are available in `@effectionx/stream-helpers/test-helpers` export.

### Faucet

The `createFaucet` function creates a stream that can be used to test the
behavior of streams that use backpressure. It's particularly useful in tests
where you need a controllable source stream.

```typescript
import { createFaucet } from "@effectionx/stream-helpers/test-helpers";
import { each, run, spawn } from "effection";

await run(function* () {
  const faucet = yield* createFaucet({ open: true });

  // Remember to spawn the stream subscription before sending items to the stream
  yield* spawn(function* () {
    for (let i of yield* each(faucet)) {
      console.log(i);
      yield* each.next();
    }
  });

  // Pass an array of items to send items to the stream one at a time synchronously
  yield* faucet.pour([1, 2, 3]);

  // Pass an operation to control the rate at which items are sent to the stream
  yield* faucet.pour(function* (send) {
    send(4);
    yield* sleep(10);
    send(5);
    yield* sleep(10);
    send(6);
  });

  // You can close the faucet to stop items from being sent
  faucet.close();

  // And open it again when needed
  faucet.open();
});
```

Items sent to the faucet stream while it's closed are not buffered, in other
words, they'll be dropped.
