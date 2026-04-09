import { timebox } from "@effectionx/timebox";
import { createChannel, each, spawn, withResolvers } from "effection";
import { describe, it } from "@effectionx/vitest";
import { expect } from "expect";
import { createValueSignal } from "./value.ts";

describe("value", () => {
  it("takes an initial value", function* () {
    const signal = yield* createValueSignal(true);

    expect(signal.valueOf()).toEqual(true);
  });
  describe("set", () => {
    it("allows to set a new value", function* () {
      const signal = yield* createValueSignal(true);

      signal.set(false);

      expect(signal.valueOf()).toEqual(false);
    });
    it("does not send a value to the stream when the set value is the same as the current value", function* () {
      expect.assertions(2);
      const signal = yield* createValueSignal(true);

      const { resolve, operation } = withResolvers<void>();

      const updates = createChannel<boolean>();
      const subscription = yield* updates;

      yield* spawn(function* () {
        for (const update of yield* each(signal)) {
          yield* updates.send(update);
          yield* each.next();
        }
      });

      yield* spawn(function* () {
        signal.set(true);

        let next = yield* timebox(10, () => subscription.next());

        expect(next.timeout).toEqual(true);

        signal.set(false);

        const updated = yield* subscription.next();

        expect(updated.value).toEqual(false);
        resolve();
      });

      yield* operation;
    });
    it("does not emit when setting NaN to NaN", function* () {
      expect.assertions(2);
      const signal = yield* createValueSignal(Number.NaN);

      const { resolve, operation } = withResolvers<void>();

      const updates = createChannel<number>();
      const subscription = yield* updates;

      yield* spawn(function* () {
        for (const update of yield* each(signal)) {
          yield* updates.send(update);
          yield* each.next();
        }
      });

      yield* spawn(function* () {
        signal.set(Number.NaN);

        const result = yield* timebox(10, () => subscription.next());

        expect(result.timeout).toEqual(true);
        expect(Number.isNaN(signal.valueOf())).toEqual(true);
        resolve();
      });

      yield* operation;
    });
    it("treats -0 and +0 as different values", function* () {
      expect.assertions(3);
      const signal = yield* createValueSignal(-0);

      const { resolve, operation } = withResolvers<void>();

      const updates = createChannel<number>();
      const subscription = yield* updates;

      yield* spawn(function* () {
        for (const update of yield* each(signal)) {
          yield* updates.send(update);
          yield* each.next();
        }
      });

      yield* spawn(function* () {
        signal.set(0);

        const next = yield* subscription.next();

        expect(Object.is(next.value, 0)).toEqual(true);
        expect(Object.is(next.value, -0)).toEqual(false);
        expect(Object.is(signal.valueOf(), 0)).toEqual(true);
        resolve();
      });

      yield* operation;
    });
  });
  describe("update", () => {
    it("updates the value of the signal", function* () {
      const signal = yield* createValueSignal(true);

      signal.update((value) => !value);

      expect(signal.valueOf()).toEqual(false);
    });
  });
});
