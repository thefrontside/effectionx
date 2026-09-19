import FakeTimers from "@sinonjs/fake-timers";
import {
  createScope,
  run,
  sleep,
  spawn,
  suspend,
  type Task,
  until,
  withResolvers,
} from "effection";
import { describe, it } from "@effectionx/vitest";
import { expect } from "expect";
import { useTaskBuffer } from "./task-buffer.ts";

describe("TaskBuffer", () => {
  it("queues up tasks when the buffer fills up", function* () {
    const clock = FakeTimers.install();

    try {
      const buffer = yield* useTaskBuffer(2);

      yield* buffer.spawn(() => sleep(10));
      yield* buffer.spawn(() => sleep(10));

      let third: Task<void> | undefined;
      yield* spawn(function* () {
        third = yield* yield* buffer.spawn(() => sleep(10));
      });

      yield* until(clock.tickAsync(5));

      // right now the third spawn is queued up, but not spawned.
      expect(third).toBeUndefined();

      yield* until(clock.tickAsync(10));

      // the other tasks finished and so the third task is active.
      expect(third).toBeDefined();
    } finally {
      clock.uninstall();
    }
  });

  it("allows to wait until buffer is drained", function* () {
    const clock = FakeTimers.install();

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

      yield* until(clock.tickAsync(10));
      yield* buffer;

      expect(finished).toEqual(3);
    } finally {
      clock.uninstall();
    }
  });
  it("admits a task, then resolves that task with its own result", function* () {
    const buffer = yield* useTaskBuffer(2);

    const admission = yield* buffer.spawn(function* () {
      return "result";
    });
    const task: Task<string> = yield* admission;

    expect(yield* task).toEqual("result");
  });

  it("halts active tasks and drops queued requests when the scope exits", function* () {
    const [scope, destroy] = createScope();
    const started = withResolvers<void>();
    const block = withResolvers<void>();
    let activeCompleted = false;
    let activeHalted = false;
    let queuedStarted = false;

    yield* scope.spawn(function* () {
      const buffer = yield* useTaskBuffer(1);

      yield* buffer.spawn(function* () {
        started.resolve();
        try {
          yield* block.operation;
          activeCompleted = true;
        } finally {
          if (!activeCompleted) {
            activeHalted = true;
          }
        }
      });
      yield* buffer.spawn(function* () {
        queuedStarted = true;
      });

      yield* block.operation;
    });

    yield* started.operation;

    yield* destroy();

    expect(activeHalted).toEqual(true);
    expect(activeCompleted).toEqual(false);
    expect(queuedStarted).toEqual(false);
  });

  it("admits a request submitted after the dispatch loop has gone idle", function* () {
    const buffer = yield* useTaskBuffer(5);
    const started = withResolvers<void>();
    const secondRan = withResolvers<void>();

    yield* buffer.spawn(function* () {
      started.resolve();
      yield* suspend();
    });

    // let the buffer go idle with capacity to spare before submitting again
    yield* started.operation;

    yield* buffer.spawn(function* () {
      secondRan.resolve();
    });

    yield* secondRan.operation;
  });

  it("propagates a task failure out of the buffer, halting its other tasks", function* () {
    let siblingCompleted = false;
    let siblingHalted = false;
    let bufferOutcome = "pending";
    let error: Error | undefined;

    try {
      yield* run(function* () {
        const buffer = yield* useTaskBuffer(5);

        yield* buffer.spawn(function* () {
          try {
            yield* suspend();
            siblingCompleted = true;
          } finally {
            siblingHalted = !siblingCompleted;
          }
        });

        yield* buffer.spawn(function* () {
          throw new Error("boom");
        });

        try {
          yield* buffer;
          bufferOutcome = "returned";
        } catch {
          bufferOutcome = "threw";
        }
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error?.message).toEqual("boom");
    expect(siblingHalted).toEqual(true);
    // the scope unwinds before `yield* buffer` can settle either way
    expect(bufferOutcome).toEqual("pending");
  });

  it("contains a failure that the spawned operation handles itself", function* () {
    let siblingCompleted = false;

    yield* run(function* () {
      const buffer = yield* useTaskBuffer(5);

      yield* buffer.spawn(function* () {
        try {
          throw new Error("boom");
        } catch {
          // handled inside the operation, so it never reaches the buffer
        }
      });

      yield* buffer.spawn(function* () {
        siblingCompleted = true;
      });

      yield* buffer;
    });

    expect(siblingCompleted).toEqual(true);
  });
});
