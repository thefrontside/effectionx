import { describe, it } from "@effectionx/deno-testing-bdd";
import { expect } from "@std/expect";
import { timebox } from "./mod.ts";
import { type Operation, sleep, suspend } from "effection";

describe("timebox", () => {
  it("is completed if operation returns within alloted time", function* () {
    let outcome = yield* timebox(100, delayed(5, () => "hello"));
    outcome.timeout;
    expect(outcome).toMatchObject({
      timeout: false,
      value: "hello",
    });
  });

  it("is completed if operation throws within alloted time", function* () {
    try {
      yield* timebox(
        100,
        delayed(5, () => {
          throw new Error("boom!");
        }),
      );
      // Should not reach here
      expect(true).toBe(false);
    } catch (error) {
      expect(error).toMatchObject({
        message: "boom!",
      });
    }
  });

  it("is timed out if operation does not return within alloted time", function* () {
    let outcome = yield* timebox(10, suspend);
    expect(outcome).toMatchObject({
      timeout: true,
    });
  });
});

function delayed<T>(delayMS: number, value: () => T): () => Operation<T> {
  return function* () {
    yield* sleep(delayMS);
    return value();
  };
}
