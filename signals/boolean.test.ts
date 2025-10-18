import { each, spawn, withResolvers } from "effection";
import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import { createBooleanSignal } from "./boolean.ts";

describe("boolean", () => {
  it("takes an initial value", function* () {
    const boolean = yield* createBooleanSignal(true);

    expect(boolean.valueOf()).toEqual(true);
  });
  describe("set", () => {
    it("allows to set a new value", function* () {
      const boolean = yield* createBooleanSignal(true);

      boolean.set(false);

      expect(boolean.valueOf()).toEqual(false);
    });
    it("does not send a value to the stream when the set value is the same as the current value", function* () {
      const boolean = yield* createBooleanSignal(true);

      const { resolve, operation } = withResolvers<void>();

      const updates: boolean[] = [];

      yield* spawn(function* () {
        for (const update of yield* each(boolean)) {
          updates.push(update);
          yield* each.next();
        }
      });

      yield* spawn(function*() {
        boolean.set(true);

        expect(updates).toEqual([]);

        boolean.set(false);

        expect(updates).toEqual([false]);
        resolve();
      });

      yield* operation;
    });
  });
  describe("update", () => {
    it("updates the value of the signal", function* () {
      const boolean = yield* createBooleanSignal(true);

      boolean.update((boolean) => !boolean);

      expect(boolean.valueOf()).toEqual(false);
    });
  });
});
