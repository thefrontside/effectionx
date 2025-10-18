import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import { each, sleep, spawn } from "effection";

import { createArraySignal } from "./array.ts";

describe("array signal", () => {
  it("accepts an initial value", function* () {
    const array = yield* createArraySignal([1, 2, 3]);

    expect(array.valueOf()).toEqual([1, 2, 3]);
  });

  describe("set", () => {
    it("allows to set a new value", function* () {
      const array = yield* createArraySignal([1, 2, 3]);

      array.set([4, 5, 6]);

      expect(array.valueOf()).toEqual([4, 5, 6]);
    });

    it("does not send a value to the stream when the set value is the same as the current value", function* () {
      const array = yield* createArraySignal<number>([]);

      const updates: number[][] = [];

      yield* spawn(function* () {
        for (const update of yield* each(array)) {
          updates.push(update);
          yield* each.next();
        }
      });

      array.set([1, 2, 3]);

      expect(updates).toEqual([[1, 2, 3]]);

      array.set([1, 2, 3]);

      expect(updates).toEqual([[1, 2, 3]]);
    });
  });

  it("allows to push a new value", function* () {
    const array = yield* createArraySignal([1, 2, 3]);

    array.push(4);

    expect(array.valueOf()).toEqual([1, 2, 3, 4]);
  });

  describe("shift", () => {
    it("returns the first value", function* () {
      const array = yield* createArraySignal([1, 2, 3]);

      const value = yield* array.shift();

      expect(value).toEqual(1);
      expect(array.valueOf()).toEqual([2, 3]);
    });

    it("blocks until a value is available", function* () {
      const ops: string[] = [];
      const array = yield* createArraySignal<number>([]);

      yield* spawn(function* () {
        ops.push("before shift");
        const value = yield* array.shift();
        ops.push(`got ${value}`);
        ops.push("after shift");
        return value;
      });

      array.push(1);
      yield* sleep(1);

      expect(ops).toEqual(["before shift", "got 1", "after shift"]);
      expect(array.valueOf()).toEqual([]);
    });
  });

  describe("update", () => {
    it("updates the value of the signal", function* () {
      const array = yield* createArraySignal([1, 2, 3]);

      array.update((array) => array.map((x) => x + 1));

      expect(array.valueOf()).toEqual([2, 3, 4]);
    });
  });
});
