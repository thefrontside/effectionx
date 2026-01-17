import { describe, it } from "@effectionx/bdd";
import { createArraySignal, is } from "@effectionx/signals";
import { expect } from "expect";
import { createChannel, sleep, spawn } from "effection";

import { batch } from "./batch.ts";
import { forEach } from "./for-each.ts";
import { useFaucet } from "./test-helpers/faucet.ts";

describe("batch", () => {
  it("creates a batch when maxTime expires", function* () {
    const source = createChannel<number, never>();
    const stream = batch({ maxTime: 50 })(source);

    const subscription = yield* stream;

    let next = yield* spawn(() => subscription.next());

    yield* source.send(1);
    yield* source.send(2);
    yield* source.send(3);

    expect((yield* next).value).toEqual([1, 2, 3]);
  });

  it("creates a batch by maxSize when maxTime is not set", function* () {
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = batch({ maxSize: 3 })(faucet);

    const subscription = yield* stream;

    yield* faucet.pour([1, 2, 3, 4, 5, 6]);

    let next = yield* subscription.next();
    expect(next.value).toEqual([1, 2, 3]);

    next = yield* subscription.next();
    expect(next.value).toEqual([4, 5, 6]);
  });

  it("creates a batch within maxTime when maxSize is never reached", function* () {
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = batch({ maxSize: 8, maxTime: 50 })(faucet);

    const batches = yield* createArraySignal<readonly number[]>([]);
    const windows: number[] = [];

    let last = performance.now();

    yield* spawn(() =>
      forEach<readonly number[], void>(function* (batch) {
        const now = performance.now();
        windows.push(now - last);
        last = now;

        batches.push(batch);
      }, stream),
    );

    yield* sleep(1);

    yield* faucet.pour(function* (send) {
      for (let i = 1; i <= 10; i++) {
        yield* send(i);
        yield* sleep(20);
      }
    });

    yield* is(batches, (list) => list.flat().length >= 10);

    expect(windows.length).toBeGreaterThanOrEqual(3);

    const avg = average(windows);
    const percentDiff = Math.abs((avg - 50) / 50) * 100;
    expect(percentDiff).toBeLessThanOrEqual(30);

    expect(batches.valueOf().flat()).toHaveLength(10);
  });

  it("creates a batch within maxSize in maxTime window", function* () {
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = batch({ maxSize: 5, maxTime: 3 })(faucet);

    const batches = yield* createArraySignal<readonly number[]>([]);

    yield* spawn(() =>
      forEach<readonly number[], void>(function* (batch) {
        batches.push(batch);
      }, stream),
    );

    yield* sleep(1);

    yield* faucet.pour([1, 2, 3, 4, 5, 6]);

    yield* is(batches, (batches) => batches.flat().length >= 6);

    expect(batches.length).toBeGreaterThan(1);
    expect(batches.valueOf().every((batch) => batch.length <= 5)).toBe(true);
  });
});

function average(arr: number[]) {
  if (arr.length === 0) {
    return 0;
  }
  const sum = arr.reduce(
    (accumulator, currentValue) => accumulator + currentValue,
    0,
  );
  return sum / arr.length;
}
