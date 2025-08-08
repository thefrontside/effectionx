import { each, run, sleep, spawn, withResolvers } from "effection";
import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";
import { batch } from "./batch.ts";
import { useFaucet } from "./test-helpers/faucet.ts";

describe("batch", () => {
  it("creates a batch when maxTime expires", async () => {
    await run(function* () {
      const faucet = yield* useFaucet<number>({ open: true });
      const stream = batch({ maxTime: 5 })(faucet);

      const subscription = yield* stream;

      yield* faucet.pour(function* (send) {
        yield* sleep(1);
        yield* send(1);
        yield* sleep(1);
        yield* send(2);
        yield* sleep(1);
        yield* send(3);
      });

      yield* sleep(10);

      let next = yield* subscription.next();

      expect(next.value).toEqual([1, 2, 3]);
    });
  });

  it("creates a batch by maxSize when maxTime is not set", async () => {
    await run(function* () {
      const faucet = yield* useFaucet<number>({ open: true });
      const stream = batch({ maxSize: 3 })(faucet);

      const subscription = yield* stream;

      yield* faucet.pour([1, 2, 3, 4, 5, 6]);

      let next = yield* subscription.next();
      expect(next.value).toEqual([1, 2, 3]);

      next = yield* subscription.next();
      expect(next.value).toEqual([4, 5, 6]);
    });
  });

  it("creates a batch within maxTime when maxSize is never reached", async () => {
    expect.assertions(1);
    await run(function* () {
      const faucet = yield* useFaucet<number>({ open: true });
      const stream = batch({ maxSize: 8, maxTime: 10 })(faucet);
      const finished = withResolvers<void>();

      const batches: Readonly<number[]>[] = [];

      yield* spawn(function* () {
        for (const batch of yield* each(stream)) {
          batches.push(batch);
          if (batches.flat().length >= 10) {
            finished.resolve();
          }
          yield* each.next();
        }
      });

      yield* faucet.pour(function* (send) {
        for (let i = 1; i <= 10; i++) {
          yield* send(i);
          yield* sleep(3);
        }
      });

      yield* finished.operation;

      expect(batches).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [10],
      ]);
    });
  });

  it("creates a batch within maxSize in maxTime window", async () => {
    await run(function* () {
      const faucet = yield* useFaucet<number>({ open: true });
      const stream = batch({ maxSize: 5, maxTime: 3 })(faucet);

      const batches: Readonly<number[]>[] = [];

      yield* spawn(function* () {
        for (const batch of yield* each(stream)) {
          batches.push(batch);
          yield* each.next();
        }
      });

      yield* faucet.pour([1, 2, 3, 4, 5, 6]);
      yield* sleep(5);

      expect(batches).toEqual([
        [1, 2, 3, 4, 5],
        [6],
      ]);
    });
  });
});
