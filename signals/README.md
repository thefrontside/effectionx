# Signals

Collection of immutable state containers for primitive data types.

## Included data types

These signals are designed using
[unidirectional data flow](https://en.wikipedia.org/wiki/Unidirectional_data_flow)
pattern in Effection operations. As with tools like Redux, the state in the data
container is immutable. A new value will be sent to the stream on every state
change.

### Boolean Signal

The Boolean Signal provides a stream for a boolean value. You can set the value
which will cause the new value to be sent to the stream.

```ts
import { each, run, spawn } from "effection";
import { createBooleanSignal } from "@effectionx/signals";

await run(function* () {
  const boolean = yield* createBooleanSignal(true);

  yield* spawn(function* () {
    for (const update of yield* each(boolean)) {
      console.log(update);
      yield* each.next();
    }
  });

  boolean.set(false); // this will send false to the stream
  boolean.set(true); // this will send true to the stream
  boolean.set(true); // this won't send anything since the value hasn't changed
});
```

For an example of Boolean Signal in action, checkout the
[faucet](https://github.com/thefrontside/effectionx/blob/main/stream-helpers/test-helpers/faucet.ts)

### Array Signal

The Array Signal provides a stream for the value of the array. The value is
considered immutable - you shouldn't modify the value that comes through the
stream, instead invoke methods on the signal to cause a new value to be sent.

```ts
import { each, run, spawn } from "effection";
import { createArraySignal } from "@effectionx/signals";

await run(function* () {
  const array = yield* createArraySignal<number>([]);

  yield* spawn(function* () {
    for (const update of yield* each(array)) {
      console.log(update);
      yield* each.next();
    }
  });

  array.push(1, 2, 3); // this will be a single update
});
```

For an example of Array Signl, checkout the
[valve](https://github.com/thefrontside/effectionx/blob/main/stream-helpers/valve.ts)
and
[batch](https://github.com/thefrontside/effectionx/blob/main/stream-helpers/batch.ts)
stream helpers.

## Helpers

### is

`is` helper is useful when you want to wait for a signal to enter a specific state.
Some of the common use cases are waiting for an array to reach a given length or for a boolean signal to become true or false. This helper takes a predicate that it
will evaluate for every value.

```ts
import { run, spawn } from 'effection';
import { createBooleanSignal, is } from '@effectionx/signals';

await run(function*() {
  const open = yield* createBooleanSignal(false);

  yield* spawn(function*() {
    yield* is(open, (open) => open === true);
    console.log("floodgates are open!");
  });

  open.set(true);
})
```