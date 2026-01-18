import { describe, it } from "@effectionx/bdd";
import { sleep } from "effection";
import { expect } from "expect";

import { raceMap } from "./race.ts";

describe("raceMap()", () => {
  it("should return the result of the first completed operation", function* () {
    let winner: string | undefined;
    const results = yield* raceMap({
      *first() {
        yield* sleep(10);
        winner = "first";
        return "first";
      },
      *second() {
        yield* sleep(20);
        winner = "second";
        return "second";
      },
    });
    expect(winner).toBe("first");
    expect(Object.keys(results)).toEqual(["first"]);
  });

  it("should halt other operations when one completes", function* () {
    let winner: string | undefined;
    let secondCompleted = false;
    const results = yield* raceMap({
      first: function* () {
        yield* sleep(10);
        winner = "first";
        return "first";
      },
      second: function* () {
        try {
          yield* sleep(20);
          winner = "second";
          secondCompleted = true;
          return "second";
        } catch {
          secondCompleted = false;
        }
      },
    });

    expect(winner).toBe("first");
    expect(Object.keys(results)).toEqual(["first"]);
    expect(secondCompleted).toBe(false);
  });
});
