import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { each, sleep, spawn } from "effection";
import { pipe } from "remeda";

import { batch } from "./batch.ts";
import { map } from "./map.ts";
import { useFaucet } from "./test-helpers/faucet.ts";
import { createTracker } from "./tracker.ts";
import { createArraySignal, is } from "@effectionx/signals";

describe("tracker", () => {
  it("waits for all items to be processed", function* () {
    const tracker = yield* createTracker();
    const faucet = yield* useFaucet<number>({ open: true });
    const received = yield* createArraySignal<number>([]);

    const stream = pipe(
      faucet,
      tracker.passthrough(),
      map(function* (x: number) {
        yield* sleep(10);
        return x;
      }),
    );

    yield* spawn(function* () {
      for (const item of yield* each(stream)) {
        yield* sleep(10);
        received.push(item);
        tracker.markOne(item);
        yield* each.next();
      }
    });

    yield* sleep(0);

    yield* faucet.pour(function* (send) {
      yield* send(1);
      yield* sleep(0);
      yield* send(2);
      yield* sleep(0);
      yield* send(3);
    });

    yield* tracker;

    yield* is(received, (received) => received.length === 3);

    expect(received.valueOf()).toEqual([1, 2, 3]);
  });

  it("tracks batched items", function* () {
    const tracker = yield* createTracker();
    const faucet = yield* useFaucet<number>({ open: true });
    const received = yield* createArraySignal<readonly number[]>([]);

    const stream = pipe(
      faucet,
      tracker.passthrough(),
      batch({
        maxSize: 3,
      }),
      map(function* (items) {
        yield* sleep(10);
        return items;
      }),
    );

    yield* spawn(function* () {
      for (const items of yield* each(stream)) {
        received.push(items);
        tracker.markMany(items);
        yield* each.next();
      }
    });

    yield* sleep(0);

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

    yield* is(received, (received) => received.flat().length >= 9);
    yield* tracker;

    expect(received.valueOf()).toEqual([
      [1, 2, 3],
      [4, 5, 6],
      [7, 8, 9],
    ]);
  });
});
