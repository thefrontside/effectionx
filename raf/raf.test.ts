import { describe, it } from "@effectionx/bdd";
import {
  caf as cancelAnimationFrame,
  raf as requestAnimationFrame,
} from "@essentials/raf";
import { expect } from "@std/expect";
import { each, sleep, spawn } from "effection";

import { raf } from "./raf.ts";

Object.assign(globalThis, {
  requestAnimationFrame,
  cancelAnimationFrame,
});

describe("raf", () => {
  it("subscription", function* () {
    expect.assertions(1);
    let count = 0;
    yield* spawn(function* () {
      for (const _ of yield* each(raf)) {
        count++;
        yield* each.next();
      }
    });
    yield* sleep(100);
    expect(count > 5).toBe(true);
  });
});
