import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { pipe } from "remeda";

import { forEach } from "./for-each.ts";
import { streamOf } from "./stream-of.ts";
import { takeUntil } from "./take-until.ts";

describe("takeUntil", () => {
  it("should yield values until predicate is true, then close with matching value", function* () {
    const values: { status: string }[] = [];

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      takeUntil((x: { status: string }) => x.status === "valid")(
        streamOf([
          { status: "pending" },
          { status: "checking" },
          { status: "valid" },
          { status: "extra" },
        ]),
      ),
    );

    expect(values).toEqual([{ status: "pending" }, { status: "checking" }]);
    expect(closeValue).toEqual({ status: "valid" });
  });

  it("should return source close value if stream ends before predicate matches", function* () {
    const values: { status: string }[] = [];

    const stream = streamOf(
      (function* () {
        yield { status: "pending" };
        yield { status: "checking" };
        return "no-match";
      })(),
    );

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      takeUntil((x: { status: string }) => x.status === "valid")(stream),
    );

    expect(values).toEqual([{ status: "pending" }, { status: "checking" }]);
    expect(closeValue).toBe("no-match");
  });

  it("should close immediately with first value if it matches predicate", function* () {
    const values: { status: string }[] = [];

    const closeValue = yield* forEach(
      function* (value) {
        values.push(value);
      },
      takeUntil((x: { status: string }) => x.status === "valid")(
        streamOf([{ status: "valid" }, { status: "extra" }]),
      ),
    );

    expect(values).toEqual([]);
    expect(closeValue).toEqual({ status: "valid" });
  });

  it("should work with validation progress pattern", function* () {
    type ValidationProgress =
      | { status: "validating" }
      | { status: "checking-inventory" }
      | { status: "valid"; data: string }
      | { status: "invalid"; errors: string[] };

    const progressStatuses: string[] = [];

    const result = yield* forEach(
      function* (progress) {
        progressStatuses.push(progress.status);
      },
      takeUntil(
        (p: ValidationProgress) =>
          p.status === "valid" || p.status === "invalid",
      )(
        streamOf<ValidationProgress, void>([
          { status: "validating" },
          { status: "checking-inventory" },
          { status: "valid", data: "ok" },
        ]),
      ),
    );

    expect(progressStatuses).toEqual(["validating", "checking-inventory"]);
    expect(result).toEqual({ status: "valid", data: "ok" });
  });

  it("should work with pipe", function* () {
    const values: number[] = [];

    const stream = pipe(
      streamOf([1, 2, 3, 4, 5]),
      takeUntil((x) => x === 4),
    );

    const closeValue = yield* forEach(function* (value) {
      values.push(value);
    }, stream);

    expect(values).toEqual([1, 2, 3]);
    expect(closeValue).toBe(4);
  });
});
