import { FakeTime } from "@std/testing/time";
import { sleep, spawn, until, type Task } from "effection";
import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import { useTaskBuffer } from "./task-buffer.ts";

describe("TaskBuffer", () => {
  it("queues up tasks when the buffer fills up", function* () {
    const time = new FakeTime();

    try {
      const buffer = yield* useTaskBuffer(2);

      yield* buffer.spawn(() => sleep(10));
      yield* buffer.spawn(() => sleep(10));

      let third: Task<void> | undefined;
      yield* spawn(function* () {
        third = yield* yield* buffer.spawn(() => sleep(10));
      });

      yield* until(time.tickAsync(5));

      // right now the third spawn is queued up, but not spawned.
      expect(third).toBeUndefined();

      yield* until(time.tickAsync(10));

      // the other tasks finished and so the third task is active.
      expect(third).toBeDefined();
    } finally {
      time.restore();
    }
  });

  it("allows to wait until buffer is drained", function* () {
    const time = new FakeTime();

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

      yield* until(time.tickAsync(10));
      yield* buffer;

      expect(finished).toEqual(3);
    } finally {
      time.restore();
    }
  });
});
