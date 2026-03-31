import { describe, it } from "@effectionx/bdd";
import { createArraySignal, is } from "@effectionx/signals";
import { timebox } from "@effectionx/timebox";
import { expect } from "expect";
import { createChannel, sleep, spawn } from "effection";

import { throttle } from "./throttle.ts";
import { forEach } from "./for-each.ts";
import { useFaucet } from "./test-helpers/faucet.ts";

interface Emission<T> {
  value: T;
  time: number;
}

describe("throttle", () => {
  it("emits the first value immediately", function* () {
    const source = createChannel<number, never>();
    const stream = throttle<number>(200)(source);
    const subscription = yield* stream;

    const start = performance.now();
    const next = yield* spawn(() => subscription.next());
    yield* source.send(1);

    const result = yield* next;
    const elapsed = performance.now() - start;

    expect(result.value).toBe(1);
    expect(elapsed).toBeLessThan(50);
  });

  it("suppresses intermediate values and emits trailing", function* () {
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = throttle<number>(100)(faucet);
    const emissions = yield* createArraySignal<Emission<number>>([]);

    yield* spawn(() =>
      forEach(function* (value) {
        emissions.push({ value, time: performance.now() });
      }, stream),
    );

    yield* sleep(0);

    yield* faucet.pour([1, 2, 3, 4, 5]);

    yield* is(emissions, (e) => e.length >= 2);

    const values = emissions.valueOf().map((e) => e.value);
    expect(values[0]).toBe(1);
    expect(values[1]).toBe(5);
    expect(values).toHaveLength(2);
  });

  it("emits trailing value after the window expires", function* () {
    const delay = 80;
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = throttle<number>(delay)(faucet);
    const emissions = yield* createArraySignal<Emission<number>>([]);

    yield* spawn(() =>
      forEach(function* (value) {
        emissions.push({ value, time: performance.now() });
      }, stream),
    );

    yield* sleep(0);

    yield* faucet.pour([1, 2, 3]);

    yield* is(emissions, (e) => e.length >= 2);

    const [leading, trailing] = emissions.valueOf();
    const gap = trailing.time - leading.time;

    expect(leading.value).toBe(1);
    expect(trailing.value).toBe(3);
    expect(gap).toBeGreaterThanOrEqual(delay * 0.8);
  });

  it("does not emit trailing before the remaining delay elapses", function* () {
    const delay = 100;
    const source = createChannel<number, never>();
    const stream = throttle<number>(delay)(source);
    const subscription = yield* stream;

    yield* spawn(function* () {
      yield* sleep(0);
      yield* source.send(1);
      yield* source.send(2);
    });

    const first = yield* subscription.next();
    expect((first as { value: number }).value).toBe(1);

    // Must NOT resolve within the first half of the window.
    const mid = yield* timebox(delay * 0.4, () => subscription.next());
    expect(mid.timeout).toBe(true);

    // After the full window, trailing is available.
    const second = yield* subscription.next();
    expect((second as { value: number }).value).toBe(2);
  });

  it("emits at most once per delay window", function* () {
    const delay = 60;
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = throttle<number>(delay)(faucet);
    const emissions = yield* createArraySignal<Emission<number>>([]);

    yield* spawn(() =>
      forEach(function* (value) {
        emissions.push({ value, time: performance.now() });
      }, stream),
    );

    yield* sleep(0);

    // Two rapid bursts — the pump blocks on its next leading pull
    // after the first burst's trailing, so the second pour triggers
    // a fresh window.
    yield* faucet.pour([1, 2, 3]);
    yield* is(emissions, (e) => e.length >= 2);
    yield* faucet.pour([10, 20, 30]);
    yield* is(emissions, (e) => e.some((v) => v.value === 30));

    const times = emissions.valueOf().map((e) => e.time);
    for (let i = 1; i < times.length; i++) {
      const gap = times[i] - times[i - 1];
      expect(gap).toBeGreaterThanOrEqual(delay * 0.8);
    }
  });

  it("handles upstream completion during the window", function* () {
    const source = createChannel<number, void>();
    const stream = throttle<number>(200)(source);
    const emissions = yield* createArraySignal<Emission<number>>([]);

    yield* spawn(() =>
      forEach(function* (value) {
        emissions.push({ value, time: performance.now() });
      }, stream),
    );

    yield* sleep(0);

    yield* source.send(1);
    yield* source.send(2);
    yield* source.send(3);
    yield* source.close();

    yield* is(emissions, (e) => e.some((v) => v.value === 3));

    const values = emissions.valueOf().map((e) => e.value);
    expect(values).toContain(1);
    expect(values).toContain(3);
  });

  it("closes only after trailing emission is handled", function* () {
    const source = createChannel<string, number>();
    const stream = throttle<string>(200)(source);
    const subscription = yield* stream;

    yield* spawn(function* () {
      yield* sleep(0);
      yield* source.send("a");
      yield* source.send("b");
      yield* source.close(42);
    });

    const first = yield* subscription.next();
    expect(first).toEqual({ done: false, value: "a" });

    const second = yield* subscription.next();
    expect(second).toEqual({ done: false, value: "b" });

    const third = yield* subscription.next();
    expect(third).toEqual({ done: true, value: 42 });
  });

  it("buffers the latest window value, not the oldest", function* () {
    const source = createChannel<number, never>();
    const stream = throttle<number>(100)(source);
    const subscription = yield* stream;

    yield* spawn(function* () {
      yield* sleep(0);
      yield* source.send(1);
      yield* source.send(2);
      yield* source.send(3);
    });

    // Leading value — returned immediately.
    const first = yield* subscription.next();
    expect(first).toEqual({ done: false, value: 1 });

    // The pump absorbs 2 and 3 during its window.  output.shift()
    // blocks until the pump pushes the trailing value.
    const second = yield* subscription.next();
    expect(second).toEqual({ done: false, value: 3 });
  });

  it("enforces spacing when consumer drains a backlog", function* () {
    const delay = 60;
    const source = createChannel<number, never>();
    const stream = throttle<number>(delay)(source);
    const subscription = yield* stream;

    yield* spawn(function* () {
      yield* sleep(0);
      for (let i = 1; i <= 6; i++) {
        yield* source.send(i);
      }
    });

    // Drain rapidly and record emission timestamps.  output.shift()
    // blocks until the pump pushes each item, and the delay gate
    // enforces spacing between consecutive emissions.
    const emissions: Emission<number>[] = [];
    const r1 = yield* subscription.next();
    emissions.push({
      value: (r1 as { value: number }).value,
      time: performance.now(),
    });

    const r2 = yield* subscription.next();
    emissions.push({
      value: (r2 as { value: number }).value,
      time: performance.now(),
    });

    // Verify values are the leading+trailing from the windows
    expect(emissions[0].value).toBe(1);
    expect(emissions[1].value).toBe(6);

    // The gap between the two emissions must respect delayMS even
    // though both values were already buffered.
    const gap = emissions[1].time - emissions[0].time;
    expect(gap).toBeGreaterThanOrEqual(delay * 0.8);
  });

  it("passes through values spaced beyond the delay", function* () {
    const delay = 20;
    const faucet = yield* useFaucet<number>({ open: true });
    const stream = throttle<number>(delay)(faucet);
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
});
