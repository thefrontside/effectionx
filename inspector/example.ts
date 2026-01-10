import { each, main, spawn, type Stream, type Subscription } from "effection";

import * as inspectors from "./context/mod.ts";
import { scoped, sleep } from "effection";

await main(function* () {
  const inspector = yield* inspectors.scope.attach();

  let watch = createStreamableSubscription(
    yield* inspector.methods.watchContextTree(),
  );

  yield* spawn(function* () {
    for (let event of yield* each(watch)) {
      console.log(event);
      yield* each.next();
    }
  });
  yield* sleep(0);
  yield* scoped(function* () {
    yield* scoped(function* () {
      yield* scoped(function* () {
      });
    });
  });
});

function createStreamableSubscription<T, TClose>(
  subscription: Subscription<T, TClose>,
): Stream<T, TClose> {
  return {
    *[Symbol.iterator]() {
      return subscription;
    },
  };
}
