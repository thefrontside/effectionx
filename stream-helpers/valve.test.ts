import { mock } from "node:test";
import { describe, it } from "@effectionx/bdd";
import { createArraySignal, is } from "@effectionx/signals";
import { each, sleep, spawn } from "effection";
import { expect } from "expect";

import { useFaucet } from "./test-helpers/faucet.ts";
import { valve } from "./valve.ts";

describe("valve", () => {
  // TODO: This test fails with effection 4.1.0-alpha.3 preview due to
  // scope teardown timing changes. Re-enable when effection 4.1.0 is stable.
  it.skip("closes and opens the valve", function* () {
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
