import { describe, it } from "@effectionx/deno-testing-bdd";
import { createArraySignal, is } from "@effectionx/signals";
import { expect } from "@std/expect";
import { assertSpyCalls, spy } from "@std/testing/mock";
import { each, sleep, spawn } from "effection";
import { valve } from "./valve.ts";

import { useFaucet } from "./test-helpers/faucet.ts";

describe("valve", () => {
  it("closes and opens the valve", function* () {
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
