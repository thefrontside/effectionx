# Stream Helpers

A collection of type-safe stream helpers built on top of
[Effection](https://github.com/thefrontside/effection) for efficient and
controlled stream processing.

## Included Helpers

### Filter

The `filter` helper narrows a stream by only passing through items that match a
predicate.

```typescript
import { filter } from "@effectionx/stream-helpers";
import { each } from "effection";

// Example: Synchronous filtering
function* syncExample(source: Stream<number, unknown>) {	

  const gt5 = filter<number>(function* (x) { return x > 5 });

  for (const value of yield* each(gt5(stream)) {
    console.log(value); // Only values > 5
    yield* each.next();
  }
};

// Example: Asynchronous filtering
function* asyncExample(source: Stream<number, unknown>) {

  const evensOf = filter<number>(function* (x) {
    yield* sleep(100); // Simulate async operation
    return x % 2 === 0; // Keep only even numbers
  }) 

  for (const value of yield* each(evensOf(stream))) {
    console.log(value); // Only even numbers
    yield* each.next();
  }
});
```

### Map

The `map` helper transforms each item in a stream using a provided function.
This is useful for data transformation operations where you need to process each
item individually.

```typescript
import { map } from "@effectionx/stream-helpers";
import { each } from "effection";

function* example(stream: Stream<number, unknown>) {
  const double = map<number>(function* (x) {
    return x * 2;
  });

  for (const value of yield* each(double(stream))) {
    console.log(value); // Each value is doubled
    yield* each.next();
  }
}
```

### Batch

The `batch` helper is useful when you want to convert individual items passing
through the stream into arrays of items. The batches can be created either by
specifying a maximum time or a maximum size. If both are specified, the batch
will be created when either condition is met.

```typescript
import { batch } from "@effectionx/stream-helpers";
import { each } from "effection";

// Example: Batch by size
function* exampleBySize(stream: Stream<number, unknown>) {
  const byThree = batch({ maxSize: 3});

  for (const items of yield* each(byThree(stream))) {
    console.log(batch); // [1, 2, 3], [4, 5, 6], ...
    yield* each.next();
  }
};

// Example: Batch by time
function* exampleByTime(stream: Stream<number, unknown>) {
  const stream = batch({ maxTime: 1000 })(sourceStream);

  for (const batch of yield* each(stream)) {
    console.log(batch); // Items received within 1 second
    yield* each.next();
  }
});

// Example: Combined batching
function* exampleCombined(stream: Stream<number, unknown>) {

  const batched = batch({
    maxSize: 5,
    maxTime: 1000,
  });

  for (const batch of yield* each(batched(stream))) {
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
import { each } from "effection";

function* example() {
  const regulated = valve({
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
  });

  for (const value of yield* each(regulated(stream))) {
    console.log(value);
    yield* each.next();
  }
}
```

### Composing stream helpers

You can use a simple `pipe()` to compose a series of stream helpers together. In
this example, we use one from [remeda](https://remedajs.com/docs/#pipe),

```typescript
import { batch, filter, map, valve } from "@effectionx/stream-helpers";
import { each } from "effection";
// any standard pipe function should work
import { pipe } from "remeda";

function* example(source: Stream<number, unknown>) {
  // Compose stream helpers using pipe
  const stream = pipe(
    source,
    valve({ open, close, openAt: 100, closeAt: 100 }),
    filter(function* (x) {
      return x > 0;
    }),
    map(function* (x) {
      return x * 20;
    }),
    batch({ maxSize: 50 }),
  );

  for (const value of yield* each(stream)) {
    console.log(value);
    yield* each.next();
  }
}
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
  const faucet = yield* createFaucet<number>({ open: true });

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
    yield* sleep(10);
    send(5);
    yield* sleep(30);
    send(6);
    yield* sleep(10);
    send(7);
  });

  // You can close the faucet to stop items from being sent
  faucet.close();

  // And open it again when needed
  faucet.open();
});
```

Items sent to the faucet stream while it's closed are not buffered, in other
words, they'll be dropped.
