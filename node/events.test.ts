import { EventEmitter } from "node:events";
import { describe, it } from "@effectionx/vitest";
import { type Operation, race, scoped, spawn, withResolvers } from "effection";
import { expect } from "expect";

import { type EventTargetLike, once } from "./events.ts";

/**
 * A spawned task does not start until its parent suspends, so anything that
 * has to happen while another task is registering its listener must run from
 * inside a task of its own.
 */
function* observe<T>(read: () => T): Operation<T> {
  const task = yield* spawn(function* () {
    return read();
  });
  return yield* task;
}

/**
 * `EventTarget` has no listener count, so count registrations ourselves.
 */
function createEventTarget(): EventTargetLike & {
  listenerCount(): number;
  dispatch(eventName: string): void;
} {
  const target = new EventTarget();
  const listeners = new Set<(event: unknown) => void>();

  return {
    addEventListener(eventName, listener) {
      listeners.add(listener);
      target.addEventListener(eventName, listener as EventListener);
    },
    removeEventListener(eventName, listener) {
      listeners.delete(listener);
      target.removeEventListener(eventName, listener as EventListener);
    },
    listenerCount: () => listeners.size,
    dispatch: (eventName) => void target.dispatchEvent(new Event(eventName)),
  };
}

describe("once", () => {
  describe("with an EventEmitter", () => {
    it("registers nothing until it is interpreted", function* () {
      const emitter = new EventEmitter();

      once(emitter, "done");

      expect(emitter.listenerCount("done")).toBe(0);
    });

    it("registers one listener and yields the event arguments", function* () {
      const emitter = new EventEmitter();

      const task = yield* spawn(function* () {
        return yield* once<[number, string]>(emitter, "exit");
      });

      expect(yield* observe(() => emitter.listenerCount("exit"))).toBe(1);

      emitter.emit("exit", 42, "SIGTERM");

      expect(yield* task).toEqual([42, "SIGTERM"]);
    });

    it("removes the listener before its owner continues", function* () {
      const emitter = new EventEmitter();

      const task = yield* spawn(function* () {
        yield* once(emitter, "done");
        return emitter.listenerCount("done");
      });

      yield* observe(() => emitter.emit("done"));

      expect(yield* task).toBe(0);
    });

    it("removes the listener when the interpreting task is halted", function* () {
      const emitter = new EventEmitter();

      const task = yield* spawn(function* () {
        yield* once(emitter, "done");
      });

      expect(yield* observe(() => emitter.listenerCount("done"))).toBe(1);

      yield* task.halt();

      expect(emitter.listenerCount("done")).toBe(0);

      emitter.emit("done");

      expect(emitter.listenerCount("done")).toBe(0);
    });

    it("removes the listener when its owning scope fails", function* () {
      const emitter = new EventEmitter();
      const failure = withResolvers<never>();
      let registered = 0;
      let caught: unknown;

      try {
        yield* scoped(function* () {
          yield* spawn(function* () {
            yield* once(emitter, "done");
          });
          yield* spawn(function* () {
            registered = emitter.listenerCount("done");
            failure.reject(new Error("boom"));
          });
          yield* failure.operation;
        });
      } catch (error) {
        caught = error;
      }

      expect((caught as Error).message).toBe("boom");
      expect(registered).toBe(1);
      expect(emitter.listenerCount("done")).toBe(0);
    });

    it("ignores an event redelivered before its owner resumes", function* () {
      const emitter = new EventEmitter();

      const task = yield* spawn(function* () {
        return yield* once<[string]>(emitter, "done");
      });

      yield* observe(() => {
        let reentered = false;
        emitter.on("done", () => {
          if (!reentered) {
            reentered = true;
            emitter.emit("done", "second");
          }
        });
        emitter.emit("done", "first");
      });

      expect(yield* task).toEqual(["first"]);
    });

    it("deregisters the losing branch of a race", function* () {
      const emitter = new EventEmitter();
      let racing = 0;

      const value = yield* race([
        once<[string]>(emitter, "loser"),
        {
          *[Symbol.iterator]() {
            racing = emitter.listenerCount("loser");
            return "won";
          },
        },
      ]);

      expect(value).toBe("won");
      expect(racing).toBe(1);
      expect(emitter.listenerCount("loser")).toBe(0);
    });
  });

  describe("with an EventTarget", () => {
    it("registers nothing until it is interpreted", function* () {
      const target = createEventTarget();

      once(target, "done");

      expect(target.listenerCount()).toBe(0);
    });

    it("registers one listener and yields the event", function* () {
      const target = createEventTarget();

      const task = yield* spawn(function* () {
        return yield* once<[Event]>(target, "done");
      });

      expect(yield* observe(() => target.listenerCount())).toBe(1);

      target.dispatch("done");

      const [event] = yield* task;
      expect(event.type).toBe("done");
      expect(target.listenerCount()).toBe(0);
    });

    it("removes the listener when the interpreting task is halted", function* () {
      const target = createEventTarget();

      const task = yield* spawn(function* () {
        yield* once(target, "done");
      });

      expect(yield* observe(() => target.listenerCount())).toBe(1);

      yield* task.halt();

      expect(target.listenerCount()).toBe(0);

      target.dispatch("done");

      expect(target.listenerCount()).toBe(0);
    });
  });
});
