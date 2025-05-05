import { each, run, sleep, spawn } from "effection";
import { describe, it } from "jsr:@std/testing@^1/bdd";
import { assertSpyCalls, spy } from "jsr:@std/testing@^1/mock";

import { expect } from "jsr:@std/expect@^1";
import { valve } from "./valve.ts";
import { createFaucet } from "./test-helpers/faucet.ts";
import { createArraySignal, is } from "./signals.ts";

describe("valve", () => {
  it("closes the valve when reached closeAt", async () => {
    const close = spy(function* () {
      console.log("closing");
    });
    const open = spy(function* () {
      console.log("opening");
    });
    await run(function* () {
      const faucet = yield* createFaucet<number>({ open: true });

      const stream = valve({
        closeAt: 5,
        close,
        open,
        openAt: 2,
      });

      const values = yield* createArraySignal<number>([]);

      yield* spawn(function* () {
        for (const value of yield* each(stream(faucet))) {
          values.push(value);
          yield* sleep(1);
          yield* each.next();
        }
      });

      yield* faucet.pour([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      yield* is(values, (values) => values.length === 10);

      expect(values.valueOf()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

      assertSpyCalls(close, 1);
      assertSpyCalls(open, 0);
    });
  });
});
