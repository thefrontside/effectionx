import { each, run, sleep, spawn, withResolvers } from "effection";
import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";
import { batch } from "./batch.ts";
import { createFaucet } from "./test-helpers/faucet.ts";

describe("batch", () => {
  it("respects maxTime", async () => {
    await run(function* () {
      const faucet = yield* createFaucet<number>({ open: true });
      const stream = batch({ maxTime: 5 })(faucet);

      const subscription = yield* stream;

      yield* faucet.pour(function*(send) {
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

  it("respects maxSize", async () => {
    await run(function* () {
      const faucet = yield* createFaucet<number>({ open: true });
      const stream = batch({ maxSize: 3 })(faucet);

      const subscription = yield* stream;

      yield* faucet.pour([1, 2, 3, 4, 5, 6]);

      let next = yield* subscription.next();
      expect(next.value).toEqual([1, 2, 3]);

      next = yield* subscription.next();
      expect(next.value).toEqual([4, 5, 6]);
    });
  });

  it("maxTime wins", async () => {
    await run(function* () {
      const faucet = yield* createFaucet<number>({ open: true });
      const stream = batch({ maxSize: 8, maxTime: 10 })(faucet);
      const finished = withResolvers<void>();

      const batches: number[][] = [];

      yield* spawn(function* () {
        for (const batch of yield* each(stream)) {
          batches.push(batch);
          if (batches.flat().length >= 10) {
            finished.resolve();
          }
          yield* each.next();
        }
      });

      yield* faucet.pour(function*(send) {
        for (let i = 1; i <= 10; i++) {
          yield* send(i);
          yield* sleep(3);
        }
      })

      yield* finished.operation;

      expect(batches.flat()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      expect(batches).toEqual([
        [1, 2, 3],
        [4, 5, 6],
        [7, 8, 9],
        [10],
      ]);
    });
  });

  it("maxSize wins within maxTime", async () => {
    await run(function* () {
      const faucet = yield* createFaucet<number>({ open: true });
      const stream = batch({ maxSize: 5, maxTime: 3 })(faucet);

      const batches: number[][] = [];

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
