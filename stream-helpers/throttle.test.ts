import { describe, it } from "@effectionx/bdd";
import { createArraySignal, is } from "@effectionx/signals";
import { expect } from "expect";
import { createChannel, sleep, spawn } from "effection";

import { throttle } from "./throttle.ts";
import { forEach } from "./for-each.ts";
import { useFaucet } from "./test-helpers/faucet.ts";

describe("throttle", () => {
  it("emits the first value immediately", function* () {
    const source = createChannel<number, never>();
    const stream = throttle<number>(100)(source);
    const subscription = yield* stream;

    const next = yield* spawn(() => subscription.next());
    yield* source.send(1);

    expect((yield* next).value).toBe(1);
  });

  it("drops intermediate values and emits trailing", function* () {
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = throttle<number>(50)(faucet);
    const results = yield* createArraySignal<number>([]);

    yield* spawn(() =>
      forEach(function* (value) {
        results.push(value);
      }, stream),
    );

    yield* sleep(0);

    yield* faucet.pour([1, 2, 3, 4, 5]);

    yield* is(results, (r) => r.length >= 2);

    const values = results.valueOf();
    expect(values[0]).toBe(1);
    expect(values[values.length - 1]).toBe(5);
  });

  it("emits the final value before stream closes", function* () {
    const source = createChannel<number, never>();
    const stream = throttle<number>(200)(source);
    const results = yield* createArraySignal<number>([]);

    yield* spawn(() =>
      forEach(function* (value) {
        results.push(value);
      }, stream),
    );

    yield* sleep(0);

    yield* source.send(1);
    yield* source.send(2);
    yield* source.send(3);
    yield* source.close();

    yield* is(results, (r) => r.includes(3));

    const values = results.valueOf();
    expect(values).toContain(1);
    expect(values).toContain(3);
  });

  it("passes through values spaced beyond the delay", function* () {
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = throttle<number>(20)(faucet);
    const results = yield* createArraySignal<number>([]);

    yield* spawn(() =>
      forEach(function* (value) {
        results.push(value);
      }, stream),
    );

    yield* sleep(0);

    yield* faucet.pour(function* (send) {
      yield* send(1);
      yield* sleep(50);
      yield* send(2);
      yield* sleep(50);
      yield* send(3);
    });

    yield* is(results, (r) => r.length >= 3);

    expect(results.valueOf()).toEqual([1, 2, 3]);
  });

  it("handles multiple throttle windows", function* () {
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = throttle<number>(30)(faucet);
    const results = yield* createArraySignal<number>([]);

    yield* spawn(() =>
      forEach(function* (value) {
        results.push(value);
      }, stream),
    );

    yield* sleep(0);

    yield* faucet.pour([1, 2, 3]);

    yield* is(results, (r) => r.length >= 2);

    yield* sleep(60);

    yield* faucet.pour([10, 20, 30]);

    yield* is(results, (r) => r.includes(30));

    const values = results.valueOf();
    expect(values).toContain(1);
    expect(values).toContain(3);
    expect(values).toContain(10);
    expect(values).toContain(30);
  });
});
