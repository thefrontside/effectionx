import { type Operation, run, suspend, until } from "effection";
import { describe, it } from "node:test";
import { inline } from "./mod.ts";
import { expect } from "expect";

describe("inline", () => {
  it("can be used for simple operations", async () => {
    let value = await run(function* () {
      return yield inline(until(Promise.resolve(10)));
    });
    expect(value).toEqual(10);
  });

  it("can be used for operations with multiple yield points", async () => {
    let result = await run(function* () {
      let first = yield inline(
        (function* () {
          return yield inline(constant(5));
        })(),
      );
      let second = yield inline(
        (function* () {
          return yield inline(constant(5));
        })(),
      );
      return (first as number) + (second as number);
    });
    expect(result).toEqual(10);
  });

  it("can be used for recursive operations", async () => {
    function* recurse(depth: number, total: number): Operation<number> {
      if (depth > 0) {
        return (yield inline(recurse(depth - 1, total + depth))) as number;
      } else {
        for (let i = 0; i < 10; i++) {
          total += yield* until(Promise.resolve(1));
        }
        return total;
      }
    }
    await expect(run(() => recurse(10, 0))).resolves.toEqual(65);
  });

  it("successfully halts inlined iterators", async () => {
    let backout = 0;

    function* recurse(depth: number, total: number): Operation<number> {
      if (depth > 0) {
        try {
          return (yield inline(recurse(depth - 1, total + depth))) as number;
        } finally {
          backout += (yield inline(until(Promise.resolve(1)))) as number;
        }
      } else {
        yield* suspend();
        return 10;
      }
    }

    let task = run(() => recurse(10, 0));

    await task.halt();

    expect(backout).toEqual(10);
  });

  it("handles unwinding when inlined iterators throw", async () => {
    interface CountingError extends Error {
      cause: number;
    }

    function* recurse(depth: number): Operation<number> {
      if (depth > 0) {
        try {
          return (yield inline(recurse(depth - 1))) as number;
        } catch (err) {
          let counter = err as CountingError;
          let num = (yield inline(until(Promise.resolve(1)))) as number;
          counter.cause += num;
          throw counter;
        }
      } else {
        let error = Object.assign(new Error("bottom"), { cause: 0 });
        throw error;
      }
    }

    try {
      await run(() => recurse(10));
      throw new Error(`expected to throw, but did not`);
    } catch (err) {
      expect((err as CountingError).cause).toEqual(10);
    }
  });
});

function constant<T>(value: T): Operation<T> {
  return {
    [Symbol.iterator]: () => ({ next: () => ({ done: true, value }) }),
  };
}
