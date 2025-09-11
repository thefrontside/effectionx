import { run, sleep } from "effection";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { map } from "./map.ts";
import { useFaucet } from "./test-helpers/faucet.ts";

describe("map", () => {
  it("handles operation transformations", async () => {
    await run(function* () {
      const faucet = yield* useFaucet<number>({ open: true });
      const stream = map(function* (x: number) {
        yield* sleep(10);
        return x * 2;
      })(faucet);

      const subscription = yield* stream;

      yield* faucet.pour([1, 2, 3]);

      let next = yield* subscription.next();
      expect(next.value).toEqual(2);

      next = yield* subscription.next();
      expect(next.value).toEqual(4);

      next = yield* subscription.next();
      expect(next.value).toEqual(6);
    });
  });

  it("preserves stream order", async () => {
    await run(function* () {
      const faucet = yield* useFaucet<number>({ open: true });
      const stream = map(function* (x: number) {
        yield* sleep(x * 10); // Longer sleep for larger numbers
        return x;
      })(faucet);

      const subscription = yield* stream;

      yield* faucet.pour([3, 1, 2]);

      let next = yield* subscription.next();
      expect(next.value).toEqual(3);

      next = yield* subscription.next();
      expect(next.value).toEqual(1);

      next = yield* subscription.next();
      expect(next.value).toEqual(2);
    });
  });
});
