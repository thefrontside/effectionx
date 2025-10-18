import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import { sleep } from "effection";

import { filter } from "./filter.ts";
import { useFaucet } from "./test-helpers/faucet.ts";

describe("filter", () => {
  it("filters items based on a predicate", function* () {
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = filter(function* (x: number) {
      yield* sleep(10);
      return x > 5;
    })(faucet);

    const subscription = yield* stream;

    yield* faucet.pour([1, 6, 2, 7, 3, 8]);

    let next = yield* subscription.next();
    expect(next.value).toEqual(6);

    next = yield* subscription.next();
    expect(next.value).toEqual(7);

    next = yield* subscription.next();
    expect(next.value).toEqual(8);
  });

  it("preserves stream order", function* () {
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = filter(function* (x: number) {
      yield* sleep(x * 10); // Longer sleep for larger numbers
      return x % 2 === 0; // Keep even numbers
    })(faucet);

    const subscription = yield* stream;

    yield* faucet.pour([3, 2, 1, 4]);

    let next = yield* subscription.next();
    expect(next.value).toEqual(2);

    next = yield* subscription.next();
    expect(next.value).toEqual(4);
  });
});
