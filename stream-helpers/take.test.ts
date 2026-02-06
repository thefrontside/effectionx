import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { pipe } from "remeda";

import { forEach } from "./for-each.ts";
import { streamOf } from "./stream-of.ts";
import { take } from "./take.ts";

describe("take", () => {
  it("should take first n values and close with the nth value", function* () {
    const values: number[] = [];

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      take<number>(3)(streamOf([1, 2, 3, 4, 5])),
    );

    expect(values).toEqual([1, 2]);
    expect(closeValue).toBe(3);
  });

  it("should return source close value if stream ends before n values", function* () {
    const values: number[] = [];

    const stream = streamOf(
      (function* () {
        yield 1;
        yield 2;
        return "early-close";
      })(),
    );

    const closeValue = yield* forEach(function* (value) {
      values.push(value);
    }, take<number>(5)(stream));

    expect(values).toEqual([1, 2]);
    expect(closeValue).toBe("early-close");
  });

  it("should work with n=1", function* () {
    const values: number[] = [];

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      take<number>(1)(streamOf([42, 100])),
    );

    expect(values).toEqual([]);
    expect(closeValue).toBe(42);
  });

  it("should work with n=0", function* () {
    const values: number[] = [];

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      take<number>(0)(streamOf([1, 2, 3])),
    );

    expect(values).toEqual([]);
    expect(closeValue).toBe(undefined);
  });

  it("should work with pipe", function* () {
    const values: number[] = [];

    const stream = pipe(streamOf([1, 2, 3, 4, 5]), take(2));

    const closeValue = yield* forEach(function* (value) {
      values.push(value);
    }, stream);

    expect(values).toEqual([1]);
    expect(closeValue).toBe(2);
  });
});
