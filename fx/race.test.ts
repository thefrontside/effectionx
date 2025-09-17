import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { run, sleep } from "effection";

import { raceMap } from "./race.ts";

const test = describe("raceMap()");

it(
  test,
  "should return the result of the first completed operation",
  async () => {
    let winner;

    const result = await run(function* () {
      const results = yield* raceMap({
        first: function* () {
          yield* sleep(10);
          winner = "first";
          return "first";
        },
        second: function* () {
          yield* sleep(20);
          winner = "second";
          return "second";
        },
      });
      return results;
    });

    expect(winner).toBe("first");
    expect(Object.keys(result)).toEqual(["first"]);
  },
);

it(test, "should halt other operations when one completes", async () => {
  let winner;
  let secondCompleted = false;

  const result = await run(function* () {
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

    return results;
  });

  expect(winner).toBe("first");
  expect(Object.keys(result)).toEqual(["first"]);
  expect(secondCompleted).toBe(false);
});
