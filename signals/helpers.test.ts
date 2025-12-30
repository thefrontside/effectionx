import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import { sleep, spawn, withResolvers } from "effection";

import { createBooleanSignal } from "./boolean.ts";
import { is } from "./helpers.ts";

describe("is", () => {
  it("waits until the value of the stream matches the predicate", function* () {
    const open = yield* createBooleanSignal(false);
    const update: string[] = [];

    const { resolve, operation } = withResolvers<void>();

    yield* spawn(function* () {
      yield* is(open, (open) => open === true);
      update.push("floodgates are open!");
      resolve();
    });

    yield* spawn(function* () {
      yield* sleep(1);
      open.set(true);
    });

    yield* operation;

    expect(update).toEqual(["floodgates are open!"]);
  });
});
