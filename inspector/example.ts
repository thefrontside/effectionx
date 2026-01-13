import {
  each,
  global,
  main,
  spawn,
  type Stream,
  type Subscription,
} from "effection";

import * as inspectors from "./task/mod.ts";
import { sleep } from "effection";

await global.run(() =>
  global.eval(function* () {
    const inspector = yield* inspectors.scope.attach();

    let taskOps = createStreamableSubscription(
      yield* inspector.methods.watchTasks(),
    );

    yield* spawn(function* () {
      for (let event of yield* each(taskOps)) {
        console.log(event);
        yield* each.next();
      }
    });
  })
);

await main(function* () {
  for (let i = 1; i <= 10; i++) {
    yield* spawn(function* () {
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
