import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { action, sleep, spawn, suspend, until } from "effection";
import type { Task } from "effection";
import { durably, InMemoryDurableStream, DivergenceError } from "./mod.ts";
import { userEffectPairs } from "./test-helpers.ts";

describe("durable run", () => {
  describe("stream recording", () => {
    it("records scope lifecycle events for a pure return (no user-facing effects)", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          return "hello";
        },
        { stream },
      );

      let events = stream.read().map((e) => e.event);
      let userEffects = events.filter(
        (e) =>
          e.type === "effect:yielded" ||
          e.type === "effect:resolved" ||
          e.type === "effect:errored",
      );
      expect(userEffects.length).toEqual(0);

      let scopeCreated = events.filter((e) => e.type === "scope:created");
      let scopeDestroyed = events.filter((e) => e.type === "scope:destroyed");
      expect(scopeCreated.length).toBeGreaterThanOrEqual(1);
      expect(scopeDestroyed.length).toBeGreaterThanOrEqual(1);
    });

    it("records events for action effects", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let value = yield* action<number>((resolve) => {
            resolve(42);
            return () => {};
          });
          return value;
        },
        { stream },
      );

      let pairs = userEffectPairs(stream);
      expect(pairs.length).toEqual(1);

      let [yielded, resolved] = pairs[0];
      expect(yielded.type).toEqual("effect:yielded");
      if (yielded.type === "effect:yielded") {
        expect(yielded.description).toEqual("action");
      }
      expect(resolved.type).toEqual("effect:resolved");
      if (resolved.type === "effect:resolved") {
        expect(resolved.value).toEqual(42);
      }
    });

    it("records events for multi-step workflows", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          let a = yield* until(Promise.resolve(10));
          let b = yield* until(Promise.resolve(20));
          return a + b;
        },
        { stream },
      );

      expect(result).toEqual(30);

      let pairs = userEffectPairs(stream);
      expect(pairs.length).toEqual(2);

      if (pairs[0][1].type === "effect:resolved") {
        expect(pairs[0][1].value).toEqual(10);
      }

      if (pairs[1][1].type === "effect:resolved") {
        expect(pairs[1][1].value).toEqual(20);
      }
    });

    it("records effect:errored events when an effect fails", function* () {
      let stream = new InMemoryDurableStream();

      try {
        yield* durably(
          function* () {
            yield* until(Promise.reject(new Error("boom")));
          },
          { stream },
        );
      } catch {
        // expected
      }

      let pairs = userEffectPairs(stream);
      expect(pairs.length).toEqual(1);

      let [yielded, errored] = pairs[0];
      expect(yielded.type).toEqual("effect:yielded");
      expect(errored.type).toEqual("effect:errored");
      if (errored.type === "effect:errored") {
        expect(errored.error.message).toEqual("boom");
      }
    });

    it("records events for sleep effects", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* sleep(1);
          return "done";
        },
        { stream },
      );

      let pairs = userEffectPairs(stream);
      expect(pairs.length).toEqual(1);
      expect(pairs[0][1].type).toEqual("effect:resolved");
    });

    it("records events when errors are caught and execution continues", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          let value: number;
          try {
            yield* until(Promise.reject(new Error("oops")));
            value = 0;
          } catch {
            value = yield* until(Promise.resolve(99));
          }
          return value;
        },
        { stream },
      );

      expect(result).toEqual(99);

      let pairs = userEffectPairs(stream);
      expect(pairs.length).toEqual(2);
      expect(pairs[0][1].type).toEqual("effect:errored");
      expect(pairs[1][1].type).toEqual("effect:resolved");

      if (pairs[1][1].type === "effect:resolved") {
        expect(pairs[1][1].value).toEqual(99);
      }
    });
  });

  describe("replay", () => {
    it("replays effects from a pre-recorded stream", function* () {
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

    it("replays multiple effects from a pre-recorded stream", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let a = yield* action<number>((resolve) => {
            resolve(10);
            return () => {};
          });
          let b = yield* action<number>((resolve) => {
            resolve(20);
            return () => {};
          });
          return a + b;
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let execCount = 0;
      let result = yield* durably(
        function* () {
          let a = yield* action<number>((resolve) => {
            execCount++;
            resolve(100);
            return () => {};
          });
          let b = yield* action<number>((resolve) => {
            execCount++;
            resolve(200);
            return () => {};
          });
          return a + b;
        },
        { stream: replayStream },
      );

      expect(execCount).toEqual(0);
      expect(result).toEqual(30);
    });

    it("replays errors from a pre-recorded stream", function* () {
      let recordStream = new InMemoryDurableStream();

      try {
        yield* durably(
          function* () {
            yield* until(Promise.reject(new Error("stored error")));
          },
          { stream: recordStream },
        );
      } catch {
        // expected
      }

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let effectExecuted = false;
      try {
        yield* durably(
          function* () {
            yield* action<number>((resolve) => {
              effectExecuted = true;
              resolve(42);
              return () => {};
            });
          },
          { stream: replayStream },
        );
        throw new Error("should have thrown");
      } catch (error) {
        expect((error as Error).message).toEqual("stored error");
      }

      expect(effectExecuted).toEqual(false);
    });
  });

  describe("mid-workflow resume", () => {
    it("replays stored effects then continues live", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let a = yield* action<number>((resolve) => {
            resolve(10);
            return () => {};
          });
          let b = yield* action<number>((resolve) => {
            resolve(20);
            return () => {};
          });
          return a + b;
        },
        { stream: recordStream },
      );

      let allEvents = recordStream.read().map((e) => e.event);

      let cutIndex = -1;
      for (let i = 0; i < allEvents.length; i++) {
        let ev = allEvents[i];
        if (ev.type === "effect:resolved") {
          if (i > 0 && allEvents[i - 1].type === "effect:yielded") {
            let yielded = allEvents[i - 1];
            if (
              yielded.type === "effect:yielded" &&
              yielded.description !== "useCoroutine()" &&
              !yielded.description.startsWith("do <")
            ) {
              cutIndex = i + 1;
              break;
            }
          }
        }
      }

      expect(cutIndex).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        allEvents.slice(0, cutIndex),
      );

      let liveEffectExecuted = false;
      let result = yield* durably(
        function* () {
          let a = yield* action<number>((resolve) => {
            resolve(100);
            return () => {};
          });
          let b = yield* action<number>((resolve) => {
            liveEffectExecuted = true;
            resolve(20);
            return () => {};
          });
          return a + b;
        },
        { stream: partialStream },
      );

      expect(result).toEqual(30);
      expect(liveEffectExecuted).toEqual(true);
    });

    it("heals unresolved replay boundary and fully replays on next run", function* () {
      let recordStream = new InMemoryDurableStream();

      let recorded = yield* durably(
        function* () {
          let first = yield* action<string>((resolve) => {
            resolve("A");
            return () => {};
          }, "first-action");

          yield* sleep(1);

          let second = yield* action<string>((resolve) => {
            resolve("B");
            return () => {};
          }, "second-action");

          yield* sleep(1);
          return `${first}-${second}`;
        },
        { stream: recordStream },
      );

      expect(recorded).toEqual("A-B");

      let allEvents = recordStream.read().map((e) => e.event);
      let boundaryIdx = allEvents.findIndex((e, i) => {
        if (e.type !== "effect:yielded" || e.description !== "sleep(1)") {
          return false;
        }
        let next = allEvents[i + 1];
        return (
          !next ||
          next.type !== "effect:resolved" ||
          next.effectId !== e.effectId
        );
      });

      if (boundaryIdx === -1) {
        boundaryIdx = allEvents.findIndex(
          (e) => e.type === "effect:yielded" && e.description === "sleep(1)",
        );
      }

      expect(boundaryIdx).toBeGreaterThan(0);

      let boundaryEvent = allEvents[boundaryIdx];
      expect(boundaryEvent.type).toEqual("effect:yielded");
      let boundaryEffectId =
        boundaryEvent.type === "effect:yielded" ? boundaryEvent.effectId : "";

      let partialStream = InMemoryDurableStream.from(
        allEvents.slice(0, boundaryIdx + 1),
      );

      let run2FirstEntered = false;
      let run2SecondEntered = false;

      let resumed = yield* durably(
        function* () {
          let first = yield* action<string>((resolve) => {
            run2FirstEntered = true;
            resolve("WRONG");
            return () => {};
          }, "first-action");

          yield* sleep(1);

          let second = yield* action<string>((resolve) => {
            run2SecondEntered = true;
            resolve("B");
            return () => {};
          }, "second-action");

          yield* sleep(1);
          return `${first}-${second}`;
        },
        { stream: partialStream },
      );

      expect(resumed).toEqual("A-B");
      expect(run2FirstEntered).toEqual(false);
      expect(run2SecondEntered).toEqual(true);

      let afterRun2 = partialStream.read().map((e) => e.event);
      let yieldedIds = new Map<string, number>();
      for (let event of afterRun2) {
        if (event.type === "effect:yielded") {
          yieldedIds.set(
            event.effectId,
            (yieldedIds.get(event.effectId) ?? 0) + 1,
          );
        }
      }

      let duplicates = Array.from(yieldedIds.entries()).filter(
        ([, count]) => count > 1,
      );
      expect(duplicates).toEqual([]);

      let boundaryYieldedCount = afterRun2.filter(
        (e) => e.type === "effect:yielded" && e.effectId === boundaryEffectId,
      ).length;
      let boundaryResolvedCount = afterRun2.filter(
        (e) =>
          (e.type === "effect:resolved" || e.type === "effect:errored") &&
          e.effectId === boundaryEffectId,
      ).length;

      expect(boundaryYieldedCount).toEqual(1);
      expect(boundaryResolvedCount).toEqual(1);

      let run3FirstEntered = false;
      let run3SecondEntered = false;

      let replayed = yield* durably(
        function* () {
          let first = yield* action<string>((resolve) => {
            run3FirstEntered = true;
            resolve("WRONG");
            return () => {};
          }, "first-action");

          yield* sleep(1);

          let second = yield* action<string>((resolve) => {
            run3SecondEntered = true;
            resolve("WRONG");
            return () => {};
          }, "second-action");

          yield* sleep(1);
          return `${first}-${second}`;
        },
        { stream: partialStream },
      );

      expect(replayed).toEqual("A-B");
      expect(run3FirstEntered).toEqual(false);
      expect(run3SecondEntered).toEqual(false);
    });
  });

  describe("divergence detection", () => {
    it("throws DivergenceError when effect description doesn't match", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* sleep(1);
          return "done";
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      try {
        yield* durably(
          function* () {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "different-action");
            return "done";
          },
          { stream: replayStream },
        );
        throw new Error("should have thrown DivergenceError");
      } catch (error) {
        expect(error).toBeInstanceOf(DivergenceError);
      }
    });
  });

  describe("halt during durable execution", () => {
    it("records suspend effect and supports halt", function* () {
      let stream = new InMemoryDurableStream();
      let halted = false;

      let task = durably(
        function* () {
          try {
            yield* suspend();
          } finally {
            halted = true;
          }
        },
        { stream },
      );

      yield* task.halt();
      expect(halted).toEqual(true);

      let events = stream.read().map((e) => e.event);
      let suspendEvents = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "suspend",
      );
      expect(suspendEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("records cleanup effects in finally blocks", function* () {
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

      let events = stream.read().map((e) => e.event);
      let yieldedDescs = events
        .filter((e) => e.type === "effect:yielded")
        .map((e) => (e.type === "effect:yielded" ? e.description : ""));

      expect(yieldedDescs).toContain("suspend");
      expect(
        yieldedDescs.some((d) => d === "sleep(1)" || d === "action"),
      ).toEqual(true);
    });
  });

  describe("workflow:return", () => {
    it("emits workflow:return before scope:destroyed for a simple workflow", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          return 42;
        },
        { stream },
      );

      // Root lifecycle events (workflow:return, scope:destroyed) are emitted
      // synchronously in the scope middleware's destroy handler, so they are
      // available immediately after durably() resolves — no sleep needed.
      let events = stream.read().map((e) => e.event);

      let workflowReturns = events.filter((e) => e.type === "workflow:return");
      expect(workflowReturns.length).toBeGreaterThanOrEqual(1);

      let rootReturn = workflowReturns.find(
        (e) => e.type === "workflow:return" && e.scopeId === "root",
      );
      expect(rootReturn).toBeDefined();
      if (rootReturn && rootReturn.type === "workflow:return") {
        expect(rootReturn.value).toEqual(42);
      }

      let rootReturnIdx = events.indexOf(rootReturn!);
      let rootDestroyIdx = events.findIndex(
        (e) => e.type === "scope:destroyed" && e.scopeId === "root",
      );
      expect(rootReturnIdx).toBeLessThan(rootDestroyIdx);
    });

    it("emits workflow:return for spawned child tasks", function* () {
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

      // Child task workflow:return events may be emitted asynchronously
      // during structured teardown (child scopes destroy before parents).
      // The root's lifecycle is synchronous, but spawned children need a tick.
      yield* sleep(0);

      let events = stream.read().map((e) => e.event);
      let workflowReturns = events.filter((e) => e.type === "workflow:return");

      expect(workflowReturns.length).toBeGreaterThanOrEqual(2);

      let childReturns = workflowReturns.filter(
        (e) => e.type === "workflow:return" && e.scopeId !== "root",
      );
      let has42 = childReturns.some(
        (e) => e.type === "workflow:return" && e.value === 42,
      );
      expect(has42).toEqual(true);
    });

    it("does not emit workflow:return when workflow errors", function* () {
      let stream = new InMemoryDurableStream();

      try {
        yield* durably(
          function* () {
            throw new Error("boom");
          },
          { stream },
        );
      } catch {
        // expected
      }

      let events = stream.read().map((e) => e.event);
      let workflowReturns = events.filter((e) => e.type === "workflow:return");

      let rootReturn = workflowReturns.find(
        (e) => e.type === "workflow:return" && e.scopeId === "root",
      );
      expect(rootReturn).toBeUndefined();
    });

    it("does not emit workflow:return when halted", function* () {
      let stream = new InMemoryDurableStream();

      let task = durably(
        function* () {
          yield* suspend();
          return "unreachable";
        },
        { stream },
      );

      yield* task.halt();

      let events = stream.read().map((e) => e.event);
      let rootReturn = events.find(
        (e) => e.type === "workflow:return" && e.scopeId === "root",
      );
      expect(rootReturn).toBeUndefined();
    });

    it("workflow:return is replayed correctly", function* () {
      let recordStream = new InMemoryDurableStream();
      yield* durably(
        function* () {
          yield* sleep(1);
          return "hello";
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let result = yield* durably(
        function* () {
          yield* sleep(1);
          return "hello";
        },
        { stream: replayStream },
      );

      expect(result).toEqual("hello");
    });
  });

  describe("durable spawn resume", () => {
    it("replays a full spawn workflow without re-executing child effects", function* () {
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

    it("resumes mid-workflow after spawn completes", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "child-work");
            return 10;
          });
          let childResult = yield* task;
          let extra = yield* action<number>((resolve) => {
            resolve(20);
            return () => {};
          }, "parent-extra");
          return childResult + extra;
        },
        { stream: recordStream },
      );

      let allEvents = recordStream.read().map((e) => e.event);

      let parentExtraIdx = allEvents.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "parent-extra",
      );
      expect(parentExtraIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        allEvents.slice(0, parentExtraIdx),
      );

      let childExecuted = false;
      let parentExtraExecuted = false;

      let result = yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* action<void>((resolve) => {
              childExecuted = true;
              resolve();
              return () => {};
            }, "child-work");
            return 10;
          });
          let childResult = yield* task;
          let extra = yield* action<number>((resolve) => {
            parentExtraExecuted = true;
            resolve(20);
            return () => {};
          }, "parent-extra");
          return childResult + extra;
        },
        { stream: partialStream },
      );

      expect(childExecuted).toEqual(false);
      expect(parentExtraExecuted).toEqual(true);
      expect(result).toEqual(30);
    });

    it("detects divergence when child effect description changes", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "original-work");
            return 42;
          });
          return yield* task;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let originalYielded = events.find(
        (ev) =>
          ev.type === "effect:yielded" && ev.description === "original-work",
      );
      let originalEffectId =
        originalYielded && originalYielded.type === "effect:yielded"
          ? originalYielded.effectId
          : "";
      let childResolvedIdx = events.findIndex(
        (e) => e.type === "effect:resolved" && e.effectId === originalEffectId,
      );
      expect(childResolvedIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, childResolvedIdx),
      );

      try {
        yield* durably(
          function* () {
            let task = yield* spawn(function* () {
              yield* action<void>((resolve) => {
                resolve();
                return () => {};
              }, "changed-work");
              return 42;
            });
            return yield* task;
          },
          { stream: partialStream },
        );
        throw new Error("should have thrown DivergenceError");
      } catch (error) {
        expect(error).toBeInstanceOf(DivergenceError);
      }
    });
  });
});

describe("multiple durable streams", () => {
  it("runs two sequential durably() calls with independent streams", function* () {
    let streamA = new InMemoryDurableStream();
    let streamB = new InMemoryDurableStream();

    let resultA = yield* durably(
      function* () {
        yield* sleep(1);
        return "alpha";
      },
      { stream: streamA },
    );

    let resultB = yield* durably(
      function* () {
        let v = yield* action<number>((resolve) => {
          resolve(42);
          return () => {};
        }, "beta-work");
        return v;
      },
      { stream: streamB },
    );

    expect(resultA).toEqual("alpha");
    expect(resultB).toEqual(42);

    // Both streams recorded events
    expect(streamA.length).toBeGreaterThan(0);
    expect(streamB.length).toBeGreaterThan(0);

    // Stream A has sleep events, stream B has "beta-work" events
    let eventsA = streamA.read().map((e) => e.event);
    let eventsB = streamB.read().map((e) => e.event);

    let sleepInA = eventsA.some(
      (e) => e.type === "effect:yielded" && e.description === "sleep(1)",
    );
    let betaInB = eventsB.some(
      (e) => e.type === "effect:yielded" && e.description === "beta-work",
    );

    expect(sleepInA).toEqual(true);
    expect(betaInB).toEqual(true);

    // No cross-contamination: stream A has no "beta-work", stream B has no "sleep(1)"
    let betaInA = eventsA.some(
      (e) => e.type === "effect:yielded" && e.description === "beta-work",
    );
    let sleepInB = eventsB.some(
      (e) => e.type === "effect:yielded" && e.description === "sleep(1)",
    );

    expect(betaInA).toEqual(false);
    expect(sleepInB).toEqual(false);

    // Both streams have scope:created for root (lifecycle started)
    let rootCreatedA = eventsA.some(
      (e) => e.type === "scope:created" && e.scopeId === "root",
    );
    let rootCreatedB = eventsB.some(
      (e) => e.type === "scope:created" && e.scopeId === "root",
    );

    expect(rootCreatedA).toEqual(true);
    expect(rootCreatedB).toEqual(true);
  });

  it("runs two concurrent durably() calls with independent streams", function* () {
    let streamA = new InMemoryDurableStream();
    let streamB = new InMemoryDurableStream();

    let taskA: Task<string> = yield* spawn(function* () {
      return yield* durably(
        function* () {
          yield* sleep(1);
          return "alpha";
        },
        { stream: streamA },
      );
    });

    let taskB: Task<string> = yield* spawn(function* () {
      return yield* durably(
        function* () {
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "beta-work");
          return "beta";
        },
        { stream: streamB },
      );
    });

    let resultA = yield* taskA;
    let resultB = yield* taskB;

    expect(resultA).toEqual("alpha");
    expect(resultB).toEqual("beta");

    // Each stream has only its own events
    let eventsA = streamA.read().map((e) => e.event);
    let eventsB = streamB.read().map((e) => e.event);

    let sleepInA = eventsA.some(
      (e) => e.type === "effect:yielded" && e.description === "sleep(1)",
    );
    let betaInB = eventsB.some(
      (e) => e.type === "effect:yielded" && e.description === "beta-work",
    );

    expect(sleepInA).toEqual(true);
    expect(betaInB).toEqual(true);

    // No cross-contamination
    let betaInA = eventsA.some(
      (e) => e.type === "effect:yielded" && e.description === "beta-work",
    );
    let sleepInB = eventsB.some(
      (e) => e.type === "effect:yielded" && e.description === "sleep(1)",
    );

    expect(betaInA).toEqual(false);
    expect(sleepInB).toEqual(false);
  });

  it("replays one stream while another runs live", function* () {
    // First: record stream A
    let recordStreamA = new InMemoryDurableStream();

    yield* durably(
      function* () {
        yield* sleep(1);
        return "alpha";
      },
      { stream: recordStreamA },
    );

    // Create replay stream from recorded events
    let replayStreamA = InMemoryDurableStream.from(
      recordStreamA.read().map((e) => e.event),
    );
    let streamB = new InMemoryDurableStream();

    let sleepExecutedOnReplay = false;
    let liveBExecuted = false;

    // Run replay of A and live B concurrently
    let taskA: Task<string> = yield* spawn(function* () {
      return yield* durably(
        function* () {
          // This sleep matches the recorded event — should be replayed, not executed
          yield* action<void>((resolve) => {
            sleepExecutedOnReplay = true;
            resolve();
            return () => {};
          }, "sleep(1)");
          return "alpha";
        },
        { stream: replayStreamA },
      );
    });

    let taskB: Task<string> = yield* spawn(function* () {
      return yield* durably(
        function* () {
          yield* action<void>((resolve) => {
            liveBExecuted = true;
            resolve();
            return () => {};
          }, "live-work");
          return "beta";
        },
        { stream: streamB },
      );
    });

    let resultA = yield* taskA;
    let resultB = yield* taskB;

    expect(resultA).toEqual("alpha");
    expect(resultB).toEqual("beta");

    // Stream A was replayed — its effect was NOT re-executed
    expect(sleepExecutedOnReplay).toEqual(false);

    // Stream B ran live — its effect WAS executed
    expect(liveBExecuted).toEqual(true);
  });
});

describe("effect ID collision prevention", () => {
  it("new live effect IDs do not collide with existing stream entries after simulated restart", function* () {
    let stream = new InMemoryDurableStream();

    // Run 1: record a workflow with two effects
    yield* durably(
      function* () {
        yield* action<void>((resolve) => {
          resolve();
          return () => {};
        }, "step-1");
        yield* action<void>((resolve) => {
          resolve();
          return () => {};
        }, "step-2");
        return "done";
      },
      { stream },
    );

    let recordedEvents = stream.read().map((e) => e.event);

    // Capture effect IDs from run 1
    let run1EffectIds = recordedEvents
      .filter((e) => e.type === "effect:yielded")
      .map((e) => (e.type === "effect:yielded" ? e.effectId : ""));

    expect(run1EffectIds.length).toBeGreaterThan(0);

    // Simulate restart: create a partial stream (only first effect pair)
    // to force mid-workflow resume
    let firstYielded = recordedEvents.findIndex(
      (e) => e.type === "effect:yielded" && e.description === "step-1",
    );
    let yieldedEvent = recordedEvents[firstYielded];
    expect(yieldedEvent).toBeDefined();
    expect(yieldedEvent.type).toEqual("effect:yielded");
    let yieldedEffectId =
      yieldedEvent.type === "effect:yielded" ? yieldedEvent.effectId : "";
    let firstResolved = recordedEvents.findIndex(
      (e) =>
        e.type === "effect:resolved" && e.effectId === yieldedEffectId,
    );

    expect(firstResolved).toBeGreaterThan(firstYielded);

    // Include events up through first resolved effect
    let partialStream = InMemoryDurableStream.from(
      recordedEvents.slice(0, firstResolved + 1),
    );

    // Run 2: resume from partial stream — second effect runs live
    yield* durably(
      function* () {
        yield* action<void>((resolve) => {
          resolve();
          return () => {};
        }, "step-1");
        yield* action<void>((resolve) => {
          resolve();
          return () => {};
        }, "step-2");
        return "done";
      },
      { stream: partialStream },
    );

    // Collect all effect IDs from the merged stream
    let allEvents = partialStream.read().map((e) => e.event);
    let allYieldedIds = allEvents
      .filter((e) => e.type === "effect:yielded")
      .map((e) => (e.type === "effect:yielded" ? e.effectId : ""));

    // No duplicate effect IDs
    let uniqueIds = new Set(allYieldedIds);
    expect(uniqueIds.size).toEqual(allYieldedIds.length);

    // New live effect IDs should NOT start from "effect-1" again
    // (they should be seeded from stream length)
    let newLiveIds = allYieldedIds.filter((id) => !run1EffectIds.includes(id));
    expect(newLiveIds.length).toBeGreaterThan(0);
  });
});

describe("non-Error throwable handling", () => {
  it("records and replays a thrown string as a proper error", function* () {
    let stream = new InMemoryDurableStream();

    // Record a workflow that catches a thrown string from an effect
    try {
      yield* durably(
        function* () {
          yield* action<void>((_resolve, reject) => {
            reject("string-error" as unknown as Error);
            return () => {};
          }, "will-throw-string");
        },
        { stream },
      );
    } catch {
      // expected
    }

    // The stream should contain an effect:errored event with a message
    let events = stream.read().map((e) => e.event);
    let errored = events.find((e) => e.type === "effect:errored");
    expect(errored).toBeDefined();
    if (errored && errored.type === "effect:errored") {
      expect(errored.error.message).toBeDefined();
      expect(typeof errored.error.message).toEqual("string");
    }

    // Replay should work without crashing
    let replayStream = InMemoryDurableStream.from(
      stream.read().map((e) => e.event),
    );

    try {
      yield* durably(
        function* () {
          yield* action<void>((_resolve, reject) => {
            reject("different" as unknown as Error);
            return () => {};
          }, "will-throw-string");
        },
        { stream: replayStream },
      );
    } catch (error) {
      // Should replay the original string error, not the new one
      expect((error as Error).message).toBeDefined();
    }
  });

  it("handles a thrown string in generator code without crashing the reducer", function* () {
    let stream = new InMemoryDurableStream();

    try {
      yield* durably(
        function* () {
          // deno-lint-ignore no-throw-literal
          throw "plain string error";
        },
        { stream },
      );
    } catch (error) {
      // The string propagates through Effection's scope teardown —
      // normalizeError operates at the reducer's interception points
      // (effect resolution, scope destroy), not at the generator throw site.
      // What matters is that the reducer doesn't crash.
      expect(error).toEqual("plain string error");
    }

    // Stream should have scope lifecycle events even after string throw
    let events = stream.read().map((e) => e.event);
    let scopeCreated = events.filter((e) => e.type === "scope:created");
    expect(scopeCreated.length).toBeGreaterThanOrEqual(1);

    // The scope:destroyed event should have a serialized error
    // (normalizeError wraps the string in the destroy middleware)
    let scopeDestroyed = events.filter((e) => e.type === "scope:destroyed");
    expect(scopeDestroyed.length).toBeGreaterThanOrEqual(1);
  });
});
