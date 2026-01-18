import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { each, Err, Ok, sleep, spawn, until } from "effection";

import { parallel } from "./parallel.ts";

import type { Operation, Result } from "effection";

interface Defer<T> {
  promise: Promise<T>;
  resolve: (t: T) => void;
  reject: (t: Error) => void;
}

function defer<T>(): Defer<T> {
  let resolve: (t: T) => void = () => {};
  let reject: (t: Error) => void = () => {};
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });

  return { resolve, reject, promise };
}

describe("parallel()", () => {
  it("should return an immediate channel with results as they are completed", function* () {
    const results = yield* parallel([
      function* () {
        yield* sleep(20);
        return "second";
      },
      function* () {
        yield* sleep(10);
        return "first";
      },
    ]);

    const res: Result<string>[] = [];
    for (const val of yield* each(results.immediate)) {
      res.push(val);
      yield* each.next();
    }

    yield* results;

    expect(res).toEqual([Ok("first"), Ok("second")]);
  });

  it("should return a sequence channel with results preserving array order as results", function* () {
    const results = yield* parallel([
      function* () {
        yield* sleep(20);
        return "second";
      },
      function* () {
        yield* sleep(10);
        return "first";
      },
    ]);

    const res: Result<string>[] = [];
    for (const val of yield* each(results.sequence)) {
      res.push(val);
      yield* each.next();
    }

    yield* results;

    expect(res).toEqual([Ok("second"), Ok("first")]);
  });

  it("should return all the result in an array, preserving order", function* () {
    const para = yield* parallel([
      function* () {
        yield* sleep(20);
        return "second";
      },
      function* () {
        yield* sleep(10);
        return "first";
      },
    ]);

    expect(yield* para).toEqual([Ok("second"), Ok("first")]);
  });

  it("should return empty array", function* (): Operation<void> {
    const results = yield* parallel([]);
    expect(yield* results).toEqual([]);
  });

  it("should resolve all async items", function* () {
    const two = defer();

    function* one() {
      yield* sleep(5);
      return 1;
    }
    yield* spawn(function* () {
      yield* sleep(15);
      two.resolve(2);
    });

    const results = yield* parallel([one, () => until(two.promise)]);
    expect(yield* results).toEqual([Ok(1), Ok(2)]);
  });

  it("should stop all operations when there is an error", function* () {
    let actual: Result<number>[] = [];
    const one = defer<number>();
    const two = defer<number>();

    function* genFn() {
      try {
        const results = yield* parallel([
          () => until(one.promise),
          () => until(two.promise),
        ]);
        actual = yield* results;
      } catch (_) {
        actual = [Err(new Error("should not get hit"))];
      }
    }

    const err = new Error("error");
    one.reject(err);
    two.resolve(1);

    yield* genFn();

    const expected = [Err(err), Ok(1)];
    expect(actual).toEqual(expected);
  });
});
