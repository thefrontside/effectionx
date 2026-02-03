import { describe, it } from "@effectionx/bdd";
import { createArraySignal, is } from "@effectionx/signals";
import { expect } from "expect";
import { mock } from "node:test";
import { each, sleep, spawn } from "effection";

import { valve } from "./valve.ts";
import { useFaucet } from "./test-helpers/faucet.ts";

describe("valve", () => {
  it("closes and opens the valve", function* () {
    const faucet = yield* useFaucet<number>({ open: true });

    const closeFn = function* () {
      faucet.close();
    };
    const close = mock.fn(closeFn);

    const openFn = function* () {
      faucet.open();
    };
    const open = mock.fn(openFn);

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
        yield* sleep(0);
        yield* each.next();
      }
    });

    yield* sleep(0);

    yield* faucet.pour([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    yield* is(values, (values) => values.length === 10);

    expect(values.valueOf()).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);

    expect(close.mock.callCount()).toBe(1);
    expect(open.mock.callCount()).toBe(1);
  });
});
