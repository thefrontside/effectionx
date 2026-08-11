import { describe, it } from "@effectionx/vitest";
import { scoped, sleep, spawn, suspend } from "effection";
import { expect } from "expect";

import { ForcedTerminationError, withForce } from "@effectionx/forceable";
import { useWorker } from "./worker.ts";

/** A worker that spins forever and never services the close message. */
function spinning() {
  let state = new Int32Array(new SharedArrayBuffer(4));
  return useWorker(import.meta.resolve("./test-assets/cpu-bound-worker.ts"), {
    type: "module",
    data: state.buffer,
  });
}

describe("withForce", () => {
  it("stays quiet by default, so forcing does not disturb the halt", function* () {
    expect.assertions(1);
    let halted: Error | undefined;

    let task = yield* spawn(function* () {
      yield* withForce(spinning(), function* (force) {
        force("cpu bound");
      });
      yield* suspend();
    });

    yield* sleep(200);
    try {
      yield* task.halt();
    } catch (error) {
      halted = error as Error;
    }

    expect(halted).toBeUndefined();
  });
});
