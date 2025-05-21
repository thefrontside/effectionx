import { each, run, sleep, spawn } from "effection";
import { describe, it } from "jsr:@std/testing@^1/bdd";
import { assertSpyCalls, spy } from "jsr:@std/testing@^1/mock";

import { expect } from "jsr:@std/expect@^1";
import { valve } from "./valve.ts";
import { useFaucet } from "./test-helpers/faucet.ts";
import { createArraySignal, is } from "@effectionx/signals";

describe("valve", () => {
  it("closes and opens the valve", async () => {
    await run(function* () {
      const faucet = yield* useFaucet<number>({ open: true });

      const close = spy(function* () {
        faucet.close();
      });

      const open = spy(function* () {
        faucet.open();
      });

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
      assertSpyCalls(open, 1);
    });
  });
});
