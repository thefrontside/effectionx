# Microstates: Composable State Streams

## Getting Started

```ts
import { each, main } from "effection";
import { boolean, state } from "@effectionx/microstates";

await main(function* () {
  const appstate = yield* state({
    isRunning: boolean(),
  });

  yield* spawn(function* () {
    for (const latest of yield* each(appstate)) {
      console.log(latest);
      yield* each.next();
    }
  });

  yield* appstate.isRunning.toggle();
});
```
