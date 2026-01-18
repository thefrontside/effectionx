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

  for (const value of yield* each(gt5(stream))) {
    console.log(value); // Only values > 5
    yield* each.next();
  }
};

// Example: Asynchronous filtering
function* asyncExample(source: Stream<number, unknown>) {

  const evensOf = filter<number>(function* (x) {
    yield* sleep(100); // Simulate async operation
    return x % 2 === 0; // Keep only even numbers
  });

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
  })(stream);

  for (const value of yield* each(regulated)) {
    console.log(value);
    yield* each.next();
  }
}
```

### ForEach

The `forEach` helper invokes a function for each item passing through a stream.
This is useful when you need to perform side effects or operations on each item
without transforming the stream itself. Unlike other stream helpers that return
transformed streams, `forEach` consumes the entire stream and returns the
stream's close value.

```typescript
import { forEach } from "@effectionx/stream-helpers";
import { createSignal, spawn } from "effection";

function* example() {
  const stream = createSignal<number, void>();

  // Process each item in the stream
  yield* spawn(() =>
    forEach(function* (item) {
      console.log(`Processing: ${item}`);
      // Perform any side effects here
    }, stream)
  );

  stream.send(1);
  stream.send(2);
  stream.send(3);
  stream.close();
}

// Example: Handling stream close value
function* exampleWithCloseValue() {
  const stream = createSignal<string, number>();

  const result = yield* spawn(() =>
    forEach(function* (item) {
      console.log(`Item: ${item}`);
    }, stream)
  );

  stream.send("hello");
  stream.send("world");
  stream.close(42); // Close with value 42

  const closeValue = yield* result;
  console.log(`Stream closed with: ${closeValue}`); // 42
}
```

### Subject

Subject helper converts any stream into a multicast stream that replays the
latest value to new subscribers. It's analogous to
[RxJS BehaviorSubject](https://www.learnrxjs.io/learn-rxjs/subjects/behaviorsubject).

```typescript
import { createSubject } from "@effectionx/stream-helpers";
import { createChannel, spawn } from "effection";

function* example() {
  const subject = createSubject<number>();
  const channel = createChannel<number, void>();
  const downstream = subject(channel);

  // First subscriber
  const sub1 = yield* downstream;

  yield* channel.send(1);
  yield* channel.send(2);

  console.log(yield* sub1.next()); // { done: false, value: 1 }
  console.log(yield* sub1.next()); // { done: false, value: 2 }

  // Late subscriber gets the latest value immediately
  const sub2 = yield* downstream;
  console.log(yield* sub2.next()); // { done: false, value: 2 }
}
```

Use it with a pipe operator to convert any stream into a behavior subject:

```typescript
import { createSubject, map } from "@effectionx/stream-helpers";
import { pipe } from "remeda";

const subject = createSubject<string>();

const stream = pipe(
  source,
  map(function* (x) {
    return x.toString();
  }),
  subject,
);
```

### Passthrough Tracker

Passthrough Tracker stream helper provides a way to know if all items that
passed through the stream have been handled. This is especially helpful when you
want to ensure that all items were processed before completing an operation.

It's different from other stream helpers because you must first call
`createTracker` function which retuns an object. The actual helper is on the
`passthrough` method which you can call and chain as you would with other
helpers.

```typescript
import { each, signal } from "effection";
import { createTracker } from "@ffectionx/stream-helpers"

const source = signal(0);

// create the tracker
const tracker = yield* createTracker();

// create  passthrough stream helper
const track = tracker.passthrough();

for (const value of yield* each(track(source))) {
  // mark items 
  tracker.markOne(value);
  yield* each.next();
}

// will resolve when all items that passed through the stream were seen
yield* tracker;
```

### fromReadable

Convert a Node.js Readable stream to an Effection Stream. This is useful for
reading files, HTTP responses, or any other Node.js Readable stream.

```typescript
import fs from "node:fs";
import { fromReadable } from "@effectionx/stream-helpers";
import { each } from "effection";

function* example() {
  const fileStream = fs.createReadStream("./data.txt");

  for (const chunk of yield* each(fromReadable(fileStream))) {
    console.log(new TextDecoder().decode(chunk));
    yield* each.next();
  }
}
```

You can compose it with other stream helpers like `lines()` to process text files:

```typescript
import fs from "node:fs";
import { fromReadable, lines } from "@effectionx/stream-helpers";
import { each, pipe } from "effection";

function* example() {
  const fileStream = fs.createReadStream("./data.txt");
  const lineStream = pipe(fromReadable(fileStream), lines());

  for (const line of yield* each(lineStream)) {
    console.log(line);
    yield* each.next();
  }
}
```

### Composing stream helpers

You can use a simple `pipe()` to compose a series of stream helpers together. In
this example, we use one from [remeda](https://remedajs.com/docs/#pipe),

```typescript
import { batch, filter, forEach, map, valve } from "@effectionx/stream-helpers";
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

  // Use forEach to process each value in the composed stream
  yield* forEach(function* (value) {
    console.log(value);
  }, stream);
}
```

## Testing Streams

The library includes testing utilities to help you test your stream processing
code. These are available in `@effectionx/stream-helpers/test-helpers` export.

### Faucet

The `useFaucet` function creates a stream that can be used to test the behavior
of streams that use backpressure. It's particularly useful in tests where you
need a controllable source stream.

```typescript
import { useFaucet } from "@effectionx/stream-helpers/test-helpers";
import { each, run, spawn } from "effection";

await run(function* () {
  const faucet = yield* useFaucet<number>({ open: true });

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
    yield* send(5);
    yield* sleep(30);
    yield* send(6);
    yield* sleep(10);
    yield* send(7);
  });

  // You can close the faucet to stop items from being sent
  faucet.close();

  // And open it again when needed
  faucet.open();
});
```

When passing a function to `faucet.pour`, the `send` function will return an
operation. This operation will block when the faucet is closed. This is
particularly helpful when testing backpressure, because you can send many event
without worrying about the `open/close` state.
