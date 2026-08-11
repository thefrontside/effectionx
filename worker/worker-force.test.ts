import { when } from "@effectionx/converge";
import { withForce } from "@effectionx/forceable";
import { describe, it } from "@effectionx/vitest";
import { type Operation, spawn, suspend } from "effection";
import { expect } from "expect";

import { useWorker } from "./worker.ts";

/**
 * A worker that spins forever and never services the close message, together
 * with the shared flag it raises once it is genuinely non-cooperative.
 */
function spinning() {
  let state = new Int32Array(new SharedArrayBuffer(4));
  let worker = useWorker(
    import.meta.resolve("./test-assets/cpu-bound-worker.ts"),
    { type: "module", data: state.buffer },
  );
  return { state, worker };
}

/** Resolves once the worker has entered its spin loop. */
function* spinLoopEntered(state: Int32Array): Operation<void> {
  yield* when(
    function* () {
      if (Atomics.load(state, 0) !== 1) {
        throw new Error("worker has not started spinning");
      }
    },
    { timeout: 10_000 },
  );
}

describe("withForce", () => {
  it("stays quiet by default, so forcing does not disturb the halt", function* () {
    expect.assertions(2);
    let { state, worker } = spinning();
    let forced: string | undefined;
    let halted: Error | undefined;

    let task = yield* spawn(function* () {
      yield* withForce(worker, function* (force) {
        forced = "cpu bound";
        force("cpu bound");
      });
      yield* suspend();
    });

    // Only once the worker is actually spinning is its refusal to close the
    // thing this halt has to overcome.
    yield* spinLoopEntered(state);

    try {
      yield* task.halt();
    } catch (error) {
      halted = error as Error;
    }

    // Forcing happened, and it happened silently.
    expect(forced).toEqual("cpu bound");
    expect(halted).toBeUndefined();
  });
});
