import { describe, it } from "@effectionx/deno-testing-bdd";
import { expect } from "@std/expect";
import { spawn } from "effection";

import { createBooleanSignal } from "./boolean.ts";
import { is } from "./helpers.ts";

describe("is", () => {
  it("waits until the value of the stream matches the predicate", function* () {
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
