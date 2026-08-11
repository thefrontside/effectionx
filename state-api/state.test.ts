import { describe, it } from "@effectionx/vitest";
import { each, scoped, sleep, spawn, withResolvers } from "effection";
import { expect } from "expect";

import { useState } from "./mod.ts";

describe("useState", () => {
  describe("basic operations", () => {
    it("sets initial state accessible via get", function* () {
      const counter = yield* useState(0);
      expect(yield* counter.get()).toEqual(0);
    });

    it("set() replaces state and returns the new state", function* () {
      const counter = yield* useState(0);
      const result = yield* counter.set(42);
      expect(result).toEqual(42);
      expect(yield* counter.get()).toEqual(42);
    });

    it("update() transforms state and returns the new state", function* () {
      const counter = yield* useState(10);
      const result = yield* counter.update((n) => n + 5);
      expect(result).toEqual(15);
      expect(yield* counter.get()).toEqual(15);
    });

    it("supports complex object state", function* () {
      const state = yield* useState({ count: 0, name: "test" });
      yield* state.set({ count: 1, name: "updated" });
      expect(yield* state.get()).toEqual({ count: 1, name: "updated" });
    });

    it("supports destructured operations", function* () {
      const counter = yield* useState(0);
      const { set, update, get } = counter;
      yield* set(10);
      expect(yield* get()).toEqual(10);
      yield* update((n) => n * 2);
      expect(yield* get()).toEqual(20);
    });
  });

  describe("stream", () => {
    it("emits new state on set()", function* () {
      const counter = yield* useState(0);
      const values: number[] = [];
      const { resolve, operation } = withResolvers<void>();

      yield* spawn(function* () {
        for (const value of yield* each(counter)) {
          values.push(value);
          if (values.length === 3) {
            resolve();
          }
          yield* each.next();
        }
      });

      // yield control to let subscriber establish (sleep(0) is policy-compliant)
      yield* sleep(0);

      yield* counter.set(1);
      yield* counter.set(2);
      yield* counter.set(3);

      yield* operation;
      expect(values).toEqual([1, 2, 3]);
    });

    it("emits new state on update()", function* () {
      const counter = yield* useState(0);
      const values: number[] = [];
      const { resolve, operation } = withResolvers<void>();

      yield* spawn(function* () {
        for (const value of yield* each(counter)) {
          values.push(value);
          if (values.length === 2) {
            resolve();
          }
          yield* each.next();
        }
      });

      // yield control to let subscriber establish (sleep(0) is policy-compliant)
      yield* sleep(0);

      yield* counter.update((n) => n + 1);
      yield* counter.update((n) => n + 10);

      yield* operation;
      expect(values).toEqual([1, 11]);
    });
  });

  describe("reducers", () => {
    it("creates typed reducer actions", function* () {
      const counter = yield* useState(0, {
        increment: (state, amount: number) => state + amount,
        decrement: (state, amount: number) => state - amount,
        reset: () => 0,
      });

      const afterInc = yield* counter.increment(5);
      expect(afterInc).toEqual(5);

      const afterDec = yield* counter.decrement(2);
      expect(afterDec).toEqual(3);

      const afterReset = yield* counter.reset();
      expect(afterReset).toEqual(0);
    });

    it("reducer actions emit to stream", function* () {
      const counter = yield* useState(0, {
        increment: (state, amount: number) => state + amount,
      });
      const values: number[] = [];
      const { resolve, operation } = withResolvers<void>();

      yield* spawn(function* () {
        for (const value of yield* each(counter)) {
          values.push(value);
          if (values.length === 3) {
            resolve();
          }
          yield* each.next();
        }
      });

      // yield control to let subscriber establish (sleep(0) is policy-compliant)
      yield* sleep(0);

      yield* counter.increment(1);
      yield* counter.increment(2);
      yield* counter.increment(3);

      yield* operation;
      expect(values).toEqual([1, 3, 6]);
    });

    it("works with complex object state", function* () {
      interface Todo {
        id: number;
        text: string;
        done: boolean;
      }

      const todos = yield* useState([] as Todo[], {
        add: (state, text: string) => [
          ...state,
          { id: state.length, text, done: false },
        ],
        toggle: (state, id: number) =>
          state.map((t) => (t.id === id ? { ...t, done: !t.done } : t)),
        remove: (state, id: number) => state.filter((t) => t.id !== id),
      });

      yield* todos.add("buy milk");
      yield* todos.add("write tests");

      const afterToggle = yield* todos.toggle(0);
      expect(afterToggle).toEqual([
        { id: 0, text: "buy milk", done: true },
        { id: 1, text: "write tests", done: false },
      ]);

      const afterRemove = yield* todos.remove(0);
      expect(afterRemove).toEqual([
        { id: 1, text: "write tests", done: false },
      ]);
    });

    it("rejects reserved reducer names", function* () {
      for (const name of ["set", "update", "get", "around"]) {
        let error: Error | undefined;
        try {
          yield* useState(0, { [name]: (state: number) => state });
        } catch (e) {
          error = e as Error;
        }
        expect(error).toBeDefined();
        expect(error?.message).toContain(`"${name}" is reserved`);
      }
    });

    it("built-in set/update still work alongside reducers", function* () {
      const counter = yield* useState(0, {
        increment: (state, amount: number) => state + amount,
      });

      yield* counter.increment(5);
      expect(yield* counter.get()).toEqual(5);

      yield* counter.set(100);
      expect(yield* counter.get()).toEqual(100);

      yield* counter.update((n) => n - 1);
      expect(yield* counter.get()).toEqual(99);
    });
  });

  describe("middleware", () => {
    it("intercepts set() calls", function* () {
      const counter = yield* useState(0);
      const log: string[] = [];

      yield* counter.around({
        *set([value], next) {
          log.push(`setting to ${value}`);
          return yield* next(value);
        },
      });

      yield* counter.set(42);
      expect(log).toEqual(["setting to 42"]);
      expect(yield* counter.get()).toEqual(42);
    });

    it("intercepts update() calls", function* () {
      const counter = yield* useState(10);
      const log: string[] = [];

      yield* counter.around({
        *update([updater], next) {
          log.push("updating");
          return yield* next(updater);
        },
      });

      yield* counter.update((n) => n + 5);
      expect(log).toEqual(["updating"]);
      expect(yield* counter.get()).toEqual(15);
    });

    it("intercepts reducer actions by name", function* () {
      const counter = yield* useState(0, {
        increment: (state, amount: number) => state + amount,
      });
      const log: string[] = [];

      yield* counter.around({
        *increment([amount], next) {
          log.push(`incrementing by ${amount}`);
          return yield* next(amount);
        },
      });

      yield* counter.increment(5);
      expect(log).toEqual(["incrementing by 5"]);
      expect(yield* counter.get()).toEqual(5);
    });

    it("middleware can modify arguments", function* () {
      const counter = yield* useState(0, {
        increment: (state, amount: number) => state + amount,
      });

      yield* counter.around({
        *increment([amount], next) {
          // double the increment
          return yield* next(amount * 2);
        },
      });

      yield* counter.increment(5);
      expect(yield* counter.get()).toEqual(10);
    });

    it("middleware can modify the return value", function* () {
      const counter = yield* useState(0);

      yield* counter.around({
        *get(_args, next) {
          const value = yield* next();
          // middleware returns a different value
          return value + 1000;
        },
      });

      // the real state is 0, but middleware adds 1000
      expect(yield* counter.get()).toEqual(1000);
    });

    it("middleware is scoped and does not leak", function* () {
      const counter = yield* useState(0);
      const log: string[] = [];

      yield* scoped(function* () {
        yield* counter.around({
          *set([value], next) {
            log.push(`inner: ${value}`);
            return yield* next(value);
          },
        });

        yield* counter.set(1);
        expect(log).toEqual(["inner: 1"]);
      });

      // After leaving the scoped block, middleware is gone
      log.length = 0;
      yield* counter.set(2);
      expect(log).toEqual([]);
      expect(yield* counter.get()).toEqual(2);
    });

    it("chains multiple middleware", function* () {
      const counter = yield* useState(0);
      const log: string[] = [];

      yield* counter.around({
        *set([value], next) {
          log.push("first");
          return yield* next(value);
        },
      });

      yield* counter.around({
        *set([value], next) {
          log.push("second");
          return yield* next(value);
        },
      });

      yield* counter.set(1);
      expect(log).toEqual(["first", "second"]);
    });
  });
});
