# Signals

Collection of immutable state containers for primitive data types.

## About

These signals are designed using [unidirectional data flow](https://en.wikipedia.org/wiki/Unidirectional_data_flow) pattern in Effection operations. As with tools like Redux, the state in the data container is immutable. A new value will be sent 
to the stream on every state change.

## Boolean Signal



## Array Signal

The Array Signal provides a stream for the value of the array. The value is considered immutable - you shouldn't modify the value that comes through the stream, instead invoke methods on the signal to cause a new value to be sent. 

```ts
import { run, spawn, each } from "effection";
import { createArraySignal } from "@effectionx/signals";

await run(function*() {
  const array = yield* createArraySignal<number>([]);

  yield* spawn(function*() {
    for (const update of yield* each(array)) {
      console.log(update)
      yield* each.next();
    }
  });

  array.push(1, 2, 3); // this will be a single update
});
```

