import {
  caf as cancelAnimationFrame,
  raf as requestAnimationFrame,
} from "@essentials/raf";

import { each, run, sleep, spawn } from "effection";
import { describe, it } from "bdd";
import { expect } from "expect";
import { raf } from "./raf.ts";

Object.assign(globalThis, {
  requestAnimationFrame,
  cancelAnimationFrame,
});

describe("raf", () => {
  it("subscription", async () => {
    expect.assertions(1);
    let count = 0;
    await run(function* () {
      yield* spawn(function* () {
        for (const _ of yield* each(raf)) {
          count++;
          yield* each.next();
        }
      });
      yield* sleep(100);
    });

    expect(count > 5).toBe(true);
  });
});
