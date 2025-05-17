import { pipe } from "npm:remeda@2.21.3";

import { each, run, sleep, spawn, withResolvers } from "effection";
import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";
import { assertSpyCalls, spy } from "jsr:@std/testing@^1/mock";

import { batch } from "./batch.ts";
import { map } from "./map.ts";
import { valve } from "./valve.ts";
import { useFaucet } from "./test-helpers/faucet.ts";
import { createTracker } from "./tracker.ts";

describe("batch, valve and map composition", () => {
  it("should process data through both batch and valve", async () => {
    await run(function* () {
      // Create a faucet as our data source
      const faucet = yield* useFaucet<number>({ open: true });

      const tracker = yield* createTracker();

      // Create spies for valve operations
      const close = spy(function* () {
        faucet.close();
      });

      const open = spy(function* () {
        faucet.open();
      });

      // Compose the streams using pipe
      const composedStream = pipe(
        faucet,
        tracker.passthrough(),
        valve({
          closeAt: 5,
          open,
          close,
          openAt: 0,
        }),
        map(function* (x) {
          yield* sleep(10);
          return { id: x, value: x * 2 };
        }),
        batch({ maxSize: 3, maxTime: 20 }),
      );

      let { resolve, operation } = withResolvers<void>();
      let results: { id: number; value: number }[][] = [];

      // Process the stream
      yield* spawn(function* () {
        let count = 0;
        for (const items of yield* each(composedStream)) {
          tracker.markMany(items.map((x) => x.id));
          results.push(items);
          count = count + items.length;
          yield* sleep(1);
          if (count >= 10) {
            resolve();
          }
          yield* each.next();
        }
      });

      // Pour data into the faucet
      yield* faucet.pour(function* (send) {
        for (let number of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
          yield* send(number);
          yield* sleep(1);
        }
      });

      yield* tracker;
      yield* operation;

      // Verify the results
      const flatResults = results.flat();
      expect(flatResults).toEqual([
        { id: 1, value: 2 },
        { id: 2, value: 4 },
        { id: 3, value: 6 },
        { id: 4, value: 8 },
        { id: 5, value: 10 },
        { id: 6, value: 12 },
        { id: 7, value: 14 },
        { id: 8, value: 16 },
        { id: 9, value: 18 },
        { id: 10, value: 20 },
      ]);

      // Verify the valve operations were called
      assertSpyCalls(close, 1);
      assertSpyCalls(open, 1);

      // Verify the batching worked correctly
      const batchSizes = results.map((batch) => batch.length);
      expect(batchSizes.every((size) => size <= 3)).toBe(true);
    });
  });
});
