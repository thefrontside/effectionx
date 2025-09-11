import { describe, it } from "@std/testing/bdd";

import { createArraySignal } from "./array.ts";
import { each, run, sleep, spawn } from "effection";
import { expect } from "@std/expect";

describe("array signal", () => {
  it("accepts an initial value", async () => {
    expect.assertions(1);
    await run(function* () {
      const array = yield* createArraySignal([1, 2, 3]);

      expect(array.valueOf()).toEqual([1, 2, 3]);
    });
  });

  describe("set", () => {
    it("allows to set a new value", async () => {
      expect.assertions(1);
      await run(function* () {
        const array = yield* createArraySignal([1, 2, 3]);

        array.set([4, 5, 6]);

        expect(array.valueOf()).toEqual([4, 5, 6]);
      });
    });

    it("does not send a value to the stream when the set value is the same as the current value", async () => {
      expect.assertions(2);
      await run(function* () {
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
  });

  it("allows to push a new value", async () => {
    expect.assertions(1);
    await run(function* () {
      const array = yield* createArraySignal([1, 2, 3]);

      array.push(4);

      expect(array.valueOf()).toEqual([1, 2, 3, 4]);
    });
  });

  describe("shift", () => {
    it("returns the first value", async () => {
      expect.assertions(2);
      await run(function* () {
        const array = yield* createArraySignal([1, 2, 3]);

        const value = yield* array.shift();

        expect(value).toEqual(1);
        expect(array.valueOf()).toEqual([2, 3]);
      });
    });

    it("blocks until a value is available", async () => {
      expect.assertions(2);
      await run(function* () {
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
  });

  describe("update", () => {
    it("updates the value of the signal", async () => {
      expect.assertions(1);
      await run(function* () {
        const array = yield* createArraySignal([1, 2, 3]);

        array.update((array) => array.map((x) => x + 1));

        expect(array.valueOf()).toEqual([2, 3, 4]);
      });
    });
  });
});
