import { pipe } from "npm:remeda@2.21.3";

import { each, run, sleep, spawn } from "effection";
import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";
import { assertSpyCalls, spy } from "jsr:@std/testing@^1/mock";

import { batch } from "./batch.ts";
import { map } from "./map.ts";
import { valve } from "./valve.ts";
import { createFaucet } from "./test-helpers/faucet.ts";
import { createArraySignal, is } from "./signals.ts";

describe("batch, valve and map composition", () => {
  it("should process data through both batch and valve", async () => {
    await run(function* () {
      // Create a faucet as our data source
      const faucet = yield* createFaucet<number>({ open: true });

      // Create spies for valve operations
      const close = spy(function* () {
        faucet.close();
      });

      const open = spy(function* () {
        faucet.open();
      });

      // Create a valve that closes at 5 and reopens at 2
      const valveStream = valve({
        closeAt: 5,
        open,
        close,
        openAt: 2,
      });

      // Create a batch processor that batches by size 3
      const batchStream = batch({ maxSize: 3 });

      // Compose the streams using pipe
      const composedStream = pipe(
        faucet,
        valveStream,
        map(function* (x) {
          return x * 2;
        }),
        batchStream,
      );

      // Collect the results
      const results = yield* createArraySignal<number[]>([]);

      // Process the stream
      yield* spawn(function* () {
        for (const batch of yield* each(composedStream)) {
          results.push(batch);
          yield* sleep(1);
          yield* each.next();
        }
      });

      // Pour data into the faucet
      yield* faucet.pour([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      // Wait until all data is processed
      yield* is(results, (values) => {
        const totalItems = values.flat().length;
        return totalItems === 10;
      });

      // Verify the results
      const flatResults = results.valueOf().flat();
      expect(flatResults).toEqual([2, 4, 6, 8, 10, 12, 14, 16, 18, 20]);

      // Verify the valve operations were called
      assertSpyCalls(close, 1);
      assertSpyCalls(open, 1);

      // Verify the batching worked correctly
      const batchSizes = results.valueOf().map((batch) => batch.length);
      expect(batchSizes.every((size) => size <= 3)).toBe(true);
    });
  });
});
