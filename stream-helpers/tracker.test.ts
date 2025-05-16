import { each, run, sleep, spawn, withResolvers } from "effection";
import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";
import { createTracker } from "./tracker.ts";
import { createFaucet } from "./test-helpers/faucet.ts";
import { pipe } from "npm:remeda@2.21.3";
import { map } from "./map.ts";
import { batch } from "./batch.ts";
describe("tracker", () => {
  it("waits for all items to be processed", async () => {
    expect.assertions(1);
    await run(function* () {
      const { operation, resolve } = withResolvers<void>();
      const tracker = yield* createTracker();
      const faucet = yield* createFaucet<number>({ open: true });

      const stream = pipe(
        faucet,
        tracker.passthrough(),
        map(function* (x: number) {
          yield* sleep(10);
          return x;
        }),
      );

      const received: number[] = [];

      yield* spawn(function* () {
        let count = 0;
        for (const item of yield* each(stream)) {
          yield* sleep(10);
          received.push(item);
          tracker.markOne(item);
          count++;
          if (count >= 3) {
            resolve();
          }
          yield* each.next();
        }
      });

      yield* faucet.pour(function* (send) {
        yield* send(1);
        yield* sleep(1);
        yield* send(2);
        yield* sleep(1);
        yield* send(3);
      });

      yield* operation;
      yield* tracker;

      expect(received).toEqual([1, 2, 3]);
    });
  });
  it("tracks batched items", async () => {
    expect.assertions(1);
    await run(function* () {
      const { operation, resolve } = withResolvers<void>();

      const tracker = yield* createTracker();
      const faucet = yield* createFaucet<number>({ open: true });
      const stream = pipe(
        faucet,
        tracker.passthrough(),
        batch({
          maxSize: 3,
        }),
        map(function* (items: number[]) {
          yield* sleep(10);
          return items;
        }),
      );

      const received: number[][] = [];

      yield* spawn(function* () {
        let count = 0;
        for (const items of yield* each(stream)) {
          received.push(items);
          tracker.markMany(items);
          count = count + items.length;
          if (count >= 9) {
            resolve();
          }
          yield* each.next();
        }
      });
      
      yield* faucet.pour(function* (send) {
        yield* send(1);
        yield* sleep(10);
        yield* send(2);
        yield* sleep(10);
        yield* send(3);
        yield* sleep(10);
        yield* send(4);
        yield* sleep(10);
        yield* send(5);
        yield* sleep(10);
        yield* send(6);
        yield* sleep(10);
        yield* send(7);
        yield* sleep(10);
        yield* send(8);
        yield* sleep(10);
        yield* send(9);
      });

      yield* operation;
      yield* tracker; 

      expect(received).toEqual([[1, 2, 3], [4, 5, 6], [7, 8, 9]]);
    });
  }); 
});
