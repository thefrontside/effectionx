import { createFaucet } from "./faucet.ts";
import { createArraySignal, is } from "../signals.ts";

import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";
import { each, race, run, sleep, spawn } from "effection";

describe("createFaucet", () => {
  it("creates a faucet that can pour items", async () => {
    await run(function* () {
      const faucet = yield* createFaucet<number>({ open: true });
      const results = yield* createArraySignal<number>([]);

      // Spawn a subscription to the faucet
      yield* spawn(function* () {
        for (const item of yield* each(faucet)) {
          results.push(item);
          yield* each.next();
        }
      });

      // Pour an array of items
      yield* faucet.pour([1, 2, 3]);

      // Wait for processing
      yield* is(results, (results) => results.length === 3);

      expect(results.valueOf()).toEqual([1, 2, 3]);
    });
  });

  it("respects the open state", async () => {
    await run(function* () {
      const faucet = yield* createFaucet<number>({ open: false });
      const results = yield* createArraySignal<number>([]);

      // Spawn a subscription to the faucet
      yield* spawn(function* () {
        for (const item of yield* each(faucet)) {
          results.push(item);
          yield* each.next();
        }
      });

      // Try to pour while closed, give it a timeout to avoid it getting stuck
      yield* race([faucet.pour([1, 2, 3]), sleep(1)]);

      expect(results.valueOf()).toEqual([]);

      faucet.open();

      yield* faucet.pour([4, 5, 6]);

      expect(results.valueOf()).toEqual([4, 5, 6]);
    });
  });

  it("supports pouring with an operation", async () => {
    await run(function* () {
      const faucet = yield* createFaucet<number>({ open: true });
      const results = yield* createArraySignal<number>([]);

      // Spawn a subscription to the faucet
      yield* spawn(function* () {
        for (const item of yield* each(faucet)) {
          results.push(item);
          yield* each.next();
        }
      });

      // Pour using a generator function
      yield* spawn(function* () {
        yield* faucet.pour(function* (send) {
          send(1);
          yield* sleep(10);
          send(2);
          yield* sleep(10);
          send(3);
        });
      });

      yield* is(results, (results) => results.length === 3);

      expect(results.valueOf()).toEqual([1, 2, 3]);
    });
  });

  it("stops pouring when closed", async () => {
    await run(function* () {
      const faucet = yield* createFaucet<number>({ open: true });
      const results = yield* createArraySignal<number>([]);

      // Spawn a subscription to the faucet
      yield* spawn(function* () {
        for (const item of yield* each(faucet)) {
          results.push(item);
          yield* each.next();
        }
      });

      // Start pouring with a generator
      yield* spawn(function* () {
        yield* faucet.pour(function* (send) {
          send(1);
          yield* sleep(10);
          send(2);
          yield* sleep(10);
          // This should not be sent because we'll close the faucet
          send(3);
        });
      });

      // Wait for the first item
      yield* sleep(15);

      // Close the faucet
      faucet.close();

      // Wait to ensure no more items are processed
      yield* sleep(20);

      expect(results.valueOf()).toEqual([1, 2]);
    });
  });
});
