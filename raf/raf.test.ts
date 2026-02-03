import { describe, it } from "@effectionx/bdd";
import {
  caf as cancelAnimationFrame,
  raf as requestAnimationFrame,
} from "@essentials/raf";
import { expect } from "expect";
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
    // Policy exception: Testing real animation frame timing requires
    // actual time to pass. This cannot use signal-based waiting because
    // frames fire based on wall-clock time, not event-driven signals.
    yield* sleep(150);
    expect(count).toBeGreaterThanOrEqual(5);
  });
});
