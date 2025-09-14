import { pipe } from "remeda";

import { sleep, spawn } from "effection";
import { describe, it } from "@effectionx/deno-testing-bdd";
import { expect } from "@std/expect";
import { assertSpyCalls, spy } from "@std/testing/mock";

import { batch } from "./batch.ts";
import { map } from "./map.ts";
import { valve } from "./valve.ts";
import { useFaucet } from "./test-helpers/faucet.ts";
import { createArraySignal, is } from "@effectionx/signals";
import { forEach } from "./for-each.ts";

describe("batch, valve and map composition", () => {
  it("should process data through both batch and valve", function* () {
      // Create a faucet as our data source
      const faucet = yield* useFaucet<number>({ open: true });

      // Create spies for valve operations
      const close = spy(function* () {
        faucet.close();
      });

      const open = spy(function* () {
        faucet.open();
      });

      let results = yield* createArraySignal<
        readonly { id: number; value: number }[]
      >([]);

      // Compose the streams using pipe
      const composedStream = pipe(
        faucet,
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

      yield* spawn(() =>
        forEach(function* (items: readonly { id: number; value: number }[]) {
          results.push(items);
        }, composedStream)
      );

      // Pour data into the faucet
      yield* faucet.pour(function* (send) {
        for (let number of [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]) {
          yield* send(number);
          yield* sleep(1);
        }
      });

      yield* is(results, (list) => list.flat().length === 10);

      // Verify the results
      const flatResults = results.valueOf().flat();
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
      const batchSizes = results.valueOf().map((batch) => batch.length);
      expect(batchSizes.every((size) => size <= 3)).toBe(true);
  });
});
