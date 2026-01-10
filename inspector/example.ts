import { each, main, spawn, suspend, type Stream, type Subscription } from "effection";

import * as inspectors from "./context/mod.ts";
import { scoped, sleep } from "effection";

await main(function* () {
  const inspector = yield* inspectors.scope.attach();

  let scopeOps = createStreamableSubscription(
    yield* inspector.methods.watchContextTree(),
  );

  let taskOps = createStreamableSubscription(
    yield* inspector.methods.watchTaskTree(),
  );

  yield* spawn(function* () {
    for (let event of yield* each(scopeOps)) {
      console.log(event);
      yield* each.next();
    }
  });

  yield* spawn(function* () {
    for (let event of yield* each(taskOps)) {
      console.log(event);
      yield* each.next();
    }
  });


  for (let i = 1; i <= 10; i++) {
    yield* spawn(function*() {
      yield* sleep(1);
      return i + " is done";
    });
  }

  yield* sleep(100);
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
