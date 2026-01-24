import { createChannel, type Operation, sleep, spawn } from "effection";
import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { forEach } from "./for-each.ts";
import { reduce } from "./reduce.ts";
import { streamOf } from "./stream-of.ts";

describe("reduce", () => {
  it("accumulates its value from the initial", function* () {
    expect.assertions(1);

    let stream = streamOf([1, 2, 3]);

    let sum = reduce(function* (total, current: number): Operation<number> {
      return total + current;
    }, 0);

    let sequence: number[] = [];
    yield* forEach(function* (item) {
      sequence.push(item);
    }, sum(stream));

    expect(sequence).toEqual([1, 3, 6]);
  });

  it("does not interfere with the closing value", function* () {
    expect.assertions(1);
    let stream = streamOf(
      (function* () {
        yield { hello: "world" } as Record<string, string>;
        yield { goobye: "world" };
        return 42;
      })(),
    );

    let merge = reduce(
      function* (
        total,
        current: Record<string, string>,
      ): Operation<Record<string, string>> {
        return { ...total, ...current };
      },
      {} as Record<string, string>,
    );

    const closeValue = yield* forEach(function* () {}, merge(stream));
    expect(closeValue).toBe(42);
  });

  it("does not emit items when the reduced value has changed", function* () {
    expect.assertions(1);

    let stream = streamOf([1, 0, 2]);

    let sum = reduce(function* (total, current: number): Operation<number> {
      return total + current;
    }, 0);

    let sequence: number[] = [];
    yield* forEach(function* (item) {
      sequence.push(item);
    }, sum(stream));

    expect(sequence).toEqual([1, 3]);
  });
});
