import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { action, sleep, spawn, suspend } from "effection";
import { durably, DivergenceError, InMemoryDurableStream } from "./mod.ts";
import { allEvents, scopeEvents } from "./test-helpers.ts";

describe("durable scope lifecycle", () => {
  describe("scope:created and scope:destroyed", () => {
    it("records scope:created for root scope at start of stream", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          return "hello";
        },
        { stream },
      );

      let events = allEvents(stream);
      let first = events[0];
      expect(first.type).toEqual("scope:created");
      if (first.type === "scope:created") {
        expect(first.scopeId).toEqual("root");
        expect(first.parentScopeId).toBeUndefined();
      }
    });

    it("records scope:destroyed for root scope at end of stream", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          return "hello";
        },
        { stream },
      );

      yield* sleep(0);

      let events = allEvents(stream);
      let last = events[events.length - 1];
      expect(last.type).toEqual("scope:destroyed");
      if (last.type === "scope:destroyed") {
        expect(last.scopeId).toEqual("root");
        expect(last.result).toEqual({ ok: true });
      }
    });

    it("records child scope lifecycle for spawned tasks", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* sleep(1);
            return 42;
          });
          return yield* task;
        },
        { stream },
      );

      yield* sleep(0);

      let events = scopeEvents(stream);

      let created = events.filter((e) => e.type === "scope:created");
      let destroyed = events.filter((e) => e.type === "scope:destroyed");

      expect(created.length).toBeGreaterThanOrEqual(2);
      expect(destroyed.length).toBeGreaterThanOrEqual(2);

      expect(created[0].type === "scope:created" && created[0].scopeId).toEqual(
        "root",
      );

      let lastDestroyed = destroyed[destroyed.length - 1];
      expect(
        lastDestroyed.type === "scope:destroyed" && lastDestroyed.scopeId,
      ).toEqual("root");
    });

    it("records parent-child relationship in scope:created events", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            return 42;
          });
          return yield* task;
        },
        { stream },
      );

      let events = allEvents(stream);
      let scopeCreatedEvents = events.filter((e) => e.type === "scope:created");

      let root = scopeCreatedEvents[0];
      expect(
        root.type === "scope:created" && root.parentScopeId,
      ).toBeUndefined();

      for (let i = 1; i < scopeCreatedEvents.length; i++) {
        let ev = scopeCreatedEvents[i];
        if (ev.type === "scope:created") {
          expect(ev.parentScopeId).toBeDefined();
        }
      }
    });

    it("destroys children before parents (structured concurrency invariant)", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* sleep(1);
            return 42;
          });
          return yield* task;
        },
        { stream },
      );

      yield* sleep(0);

      let events = scopeEvents(stream);
      let destroyEvents = events.filter((e) => e.type === "scope:destroyed");

      let lastDestroyed = destroyEvents[destroyEvents.length - 1];
      if (lastDestroyed.type === "scope:destroyed") {
        expect(lastDestroyed.scopeId).toEqual("root");
      }
    });
  });

  describe("scope IDs in effect events", () => {
    it("tags effect:yielded events with the correct scope ID", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* action<number>((resolve) => {
            resolve(42);
            return () => {};
          });
          return 42;
        },
        { stream },
      );

      let events = allEvents(stream);
      let effectYielded = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "action",
      );

      expect(effectYielded.length).toEqual(1);
      if (effectYielded[0].type === "effect:yielded") {
        expect(effectYielded[0].scopeId).not.toEqual("unknown");
      }
    });

    it("tags spawned task effects with child scope ID, not root", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "child-action");
            return 42;
          });
          return yield* task;
        },
        { stream },
      );

      let events = allEvents(stream);

      let childAction = events.find(
        (e) => e.type === "effect:yielded" && e.description === "child-action",
      );
      expect(childAction).toBeDefined();

      if (childAction && childAction.type === "effect:yielded") {
        expect(childAction.scopeId).not.toEqual("root");
        expect(childAction.scopeId).not.toEqual("unknown");
      }
    });
  });

  describe("replay with scope events", () => {
    it("replays scope events while creating real scopes", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let value = yield* action<number>((resolve) => {
            resolve(42);
            return () => {};
          });
          return value;
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let effectExecuted = false;
      let result = yield* durably(
        function* () {
          let value = yield* action<number>((resolve) => {
            effectExecuted = true;
            resolve(999);
            return () => {};
          });
          return value;
        },
        { stream: replayStream },
      );

      expect(effectExecuted).toEqual(false);
      expect(result).toEqual(42);
    });

    it("replays scope events for workflows with spawn", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "child-work");
            return 42;
          });
          return yield* task;
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let childExecuted = false;
      let result = yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* action<void>((resolve) => {
              childExecuted = true;
              resolve();
              return () => {};
            }, "child-work");
            return 42;
          });
          return yield* task;
        },
        { stream: replayStream },
      );

      expect(childExecuted).toEqual(false);
      expect(result).toEqual(42);
    });
  });

  describe("scope:destroyed on error", () => {
    it("records scope:destroyed with ok:false when workflow errors", function* () {
      let stream = new InMemoryDurableStream();

      try {
        yield* durably(
          function* () {
            yield* sleep(1);
            throw new Error("workflow error");
          },
          { stream },
        );
      } catch {
        // expected
      }

      yield* sleep(0);

      let events = allEvents(stream);
      let destroyEvents = events.filter((e) => e.type === "scope:destroyed");

      let errorDestroy = destroyEvents.find(
        (e) => e.type === "scope:destroyed" && !e.result.ok,
      );
      expect(errorDestroy).toBeDefined();
      if (
        errorDestroy &&
        errorDestroy.type === "scope:destroyed" &&
        !errorDestroy.result.ok
      ) {
        expect(errorDestroy.result.error.message).toEqual("workflow error");
      }
    });
  });

  describe("halt with scope events", () => {
    it("records scope lifecycle during halt", function* () {
      let stream = new InMemoryDurableStream();

      let task = durably(
        function* () {
          try {
            yield* suspend();
          } finally {
            yield* sleep(1);
          }
        },
        { stream },
      );

      yield* task.halt();

      let events = scopeEvents(stream);

      let created = events.filter((e) => e.type === "scope:created");
      let destroyed = events.filter((e) => e.type === "scope:destroyed");

      expect(created.length).toBeGreaterThanOrEqual(1);
      expect(destroyed.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("workflow:return in scope lifecycle", () => {
    it("emits workflow:return before scope:destroyed for each task scope", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            return 42;
          });
          return yield* task;
        },
        { stream },
      );

      let events = allEvents(stream);
      let workflowReturns = events.filter((e) => e.type === "workflow:return");

      expect(workflowReturns.length).toBeGreaterThanOrEqual(1);

      for (let wr of workflowReturns) {
        if (wr.type === "workflow:return") {
          let wrIdx = events.indexOf(wr);
          let destroyIdx = events.findIndex(
            (e) => e.type === "scope:destroyed" && e.scopeId === wr.scopeId,
          );
          if (destroyIdx >= 0) {
            expect(wrIdx).toBeLessThan(destroyIdx);
          }
        }
      }
    });
  });

  describe("scope hierarchy divergence", () => {
    it("detects parent mismatch during replay", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "child-work");
            return 42;
          });
          return yield* task;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let tamperedEvents = events.map((e) => {
        if (e.type === "scope:created" && e.parentScopeId) {
          return { ...e, parentScopeId: "wrong-parent" };
        }
        return e;
      });

      let replayStream = InMemoryDurableStream.from(tamperedEvents);

      try {
        yield* durably(
          function* () {
            let task = yield* spawn(function* () {
              yield* action<void>((resolve) => {
                resolve();
                return () => {};
              }, "child-work");
              return 42;
            });
            return yield* task;
          },
          { stream: replayStream },
        );
        throw new Error("should have thrown DivergenceError");
      } catch (error) {
        expect(error).toBeInstanceOf(DivergenceError);
      }
    });
  });
});
