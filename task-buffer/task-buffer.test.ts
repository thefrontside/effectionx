import { mock } from "node:test";
import { setImmediate } from "node:timers";
import { sleep, spawn, type Task, until } from "effection";
import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { useTaskBuffer } from "./task-buffer.ts";

function tickAsync(ms: number) {
  return new Promise<void>((resolve) => {
    mock.timers.tick(ms);
    setImmediate(resolve);
  });
}

describe("TaskBuffer", () => {
  it("queues up tasks when the buffer fills up", function* () {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      const buffer = yield* useTaskBuffer(2);

      yield* buffer.spawn(() => sleep(10));
      yield* buffer.spawn(() => sleep(10));

      let third: Task<void> | undefined;
      yield* spawn(function* () {
        third = yield* yield* buffer.spawn(() => sleep(10));
      });

      yield* until(tickAsync(5));

      // right now the third spawn is queued up, but not spawned.
      expect(third).toBeUndefined();

      yield* until(tickAsync(10));

      // the other tasks finished and so the third task is active.
      expect(third).toBeDefined();
    } finally {
      mock.timers.reset();
    }
  });

  it("allows to wait until buffer is drained", function* () {
    mock.timers.enable({ apis: ["setTimeout"] });
    try {
      let finished = 0;
      const buffer = yield* useTaskBuffer(5);
      for (let i = 0; i < 3; i++) {
        yield* buffer.spawn(function* () {
          yield* sleep(10);
          finished++;
        });
      }

      expect(finished).toEqual(0);

      yield* until(tickAsync(10));
      yield* buffer;

      expect(finished).toEqual(3);
    } finally {
      mock.timers.reset();
    }
  });
});
