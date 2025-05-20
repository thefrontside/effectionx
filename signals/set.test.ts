import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { each, run, spawn } from "effection";
import { createSetSignal } from "./set.ts";
import { Set } from "immutable";

describe("createSetSignal", () => {
  it("should create a set signal", async () => {
    expect.assertions(1);

    await run(function* () {
      const set = yield* createSetSignal<number>([]);

      set.add(1);

      expect(set.valueOf().toArray()).toEqual([1]);
    });
  });
  describe("set", () => {
    it("should set the value of the set", async () => {
      expect.assertions(1);
      
      await run(function* () {
        const set = yield* createSetSignal<number>([1, 2, 3]);

        set.set(Set.of(4, 5, 6));

        expect(set.valueOf().toArray()).toEqual([4, 5, 6]);
      });
    });
    it("should not update if the set is the same", async () => {
      expect.assertions(1);
      
      await run(function* () {
        const set = yield* createSetSignal<number>([1, 2, 3]);  

        const updates = [];

        yield* spawn(function* () {
          for (const update of yield* each(set)) {
            updates.push(update);
            yield* each.next();
          }
        });

        set.set(Set.of(1, 2, 3));

        expect(set.valueOf().toArray()).toEqual([]);
      });
    });
  }); 
  describe("difference", () => {
    it("should return a new set with the items that are in the current set but not in the given iterable", async () => {
      expect.assertions(1);
      
      await run(function* () {
        const set = yield* createSetSignal<number>([1, 2, 3]);

        set.difference([2, 3, 4]);

        expect(set.valueOf().toArray()).toEqual([1]);
      });
    });
  });
  describe("delete", () => {
    it("should remove an item from the set", async () => {
      expect.assertions(1);
      
      await run(function* () {
        const set = yield* createSetSignal<number>([1, 2, 3]);

        set.delete(2);

        expect(set.valueOf().toArray()).toEqual([1, 3]);
      }); 
    });
  });
  describe("add", () => {
    it("should add an item to the set", async () => {
      expect.assertions(1);

      await run(function* () {
        const set = yield* createSetSignal<number>([1, 2, 3]);

        set.add(4);

        expect(set.valueOf().toArray()).toEqual([1, 2, 3, 4]);
      });
    });
  });
});