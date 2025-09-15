import { expect } from "@std/expect";
import { describe, it } from "@std/testing/bdd";
import { run, spawn } from "effection";

import { createBooleanSignal } from "./boolean.ts";
import { is } from "./helpers.ts";

describe("is", () => {
  it("waits until the value of the stream matches the predicate", async () => {
    expect.assertions(1);
    await run(function* () {
      const open = yield* createBooleanSignal(false);
      const update: string[] = [];

      yield* spawn(function* () {
        yield* is(open, (open) => open === true);
        update.push("floodgates are open!");
      });

      open.set(true);

      expect(update).toEqual(["floodgates are open!"]);
    });
  });
});
