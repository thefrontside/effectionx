import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { pipe } from "remeda";

import { forEach } from "./for-each.ts";
import { streamOf } from "./stream-of.ts";
import { takeWhile } from "./take-while.ts";

describe("takeWhile", () => {
  it("should yield values while predicate is true", function* () {
    const values: number[] = [];

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      takeWhile((x: number) => x < 3)(streamOf([1, 2, 3, 4, 5])),
    );

    expect(values).toEqual([1, 2]);
    expect(closeValue).toBe(undefined);
  });

  it("should return source close value if stream ends before predicate fails", function* () {
    const values: number[] = [];

    const stream = streamOf(
      (function* () {
        yield 1;
        yield 2;
        return "early-close";
      })(),
    );

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      takeWhile((x: number) => x < 10)(stream),
    );

    expect(values).toEqual([1, 2]);
    expect(closeValue).toBe("early-close");
  });

  it("should not include the failing value", function* () {
    const values: number[] = [];

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      takeWhile((x: number) => x < 50)(streamOf([1, 2, 100, 3])),
    );

    expect(values).toEqual([1, 2]);
    expect(closeValue).toBe(undefined);
  });

  it("should stop immediately if first value fails predicate", function* () {
    const values: number[] = [];

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      takeWhile((x: number) => x < 50)(streamOf([100, 1, 2])),
    );

    expect(values).toEqual([]);
    expect(closeValue).toBe(undefined);
  });

  it("should work with pipe", function* () {
    const values: number[] = [];

    const stream = pipe(
      streamOf([1, 2, 3, 4, 5]),
      takeWhile((x) => x < 4),
    );

    const closeValue = yield* forEach(function* (value) {
      values.push(value);
    }, stream);

    expect(values).toEqual([1, 2, 3]);
    expect(closeValue).toBe(undefined);
  });
});
