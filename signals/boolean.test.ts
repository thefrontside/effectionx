import { each, run, spawn } from "effection";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { createBooleanSignal } from "./boolean.ts";

describe("boolean", () => {
  it("takes an initial value", async () => {
    expect.assertions(1);
    await run(function* () {
      const boolean = yield* createBooleanSignal(true);

      expect(boolean.valueOf()).toEqual(true);
    });
  });
  describe("set", () => {
    it("allows to set a new value", async () => {
      expect.assertions(1);
      await run(function* () {
        const boolean = yield* createBooleanSignal(true);

        boolean.set(false);

        expect(boolean.valueOf()).toEqual(false);
      });
    });
    it("does not send a value to the stream when the set value is the same as the current value", async () => {
      expect.assertions(2);
      await run(function* () {
        const boolean = yield* createBooleanSignal(true);

        const updates: boolean[] = [];

        yield* spawn(function* () {
          for (const update of yield* each(boolean)) {
            updates.push(update);
            yield* each.next();
          }
        });

        boolean.set(true);

        expect(updates).toEqual([]);

        boolean.set(false);

        expect(updates).toEqual([false]);
      });
    });
  });
  describe("update", () => {
    it("updates the value of the signal", async () => {
      expect.assertions(1);
      await run(function* () {
        const boolean = yield* createBooleanSignal(true);

        boolean.update((boolean) => !boolean);

        expect(boolean.valueOf()).toEqual(false);
      });
    });
  });
});
