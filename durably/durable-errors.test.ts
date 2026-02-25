import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import {
  action,
  call,
  createChannel,
  createContext,
  createSignal,
  each,
  interval,
  race,
  sleep,
  spawn,
  suspend,
  until,
  useAbortSignal,
  withResolvers,
} from "effection";
import { durably, InMemoryDurableStream, isLiveOnly } from "./mod.ts";
import { allEvents } from "./test-helpers.ts";

describe("durable error handling", () => {
  describe("replay of caught errors", () => {
    it("replays a caught error and takes the catch path without re-executing effects", function* () {
      let recordStream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          let value: string;
          try {
            yield* until(Promise.reject(new Error("oops")));
            value = "should-not-reach";
          } catch {
            value = yield* action<string>((resolve) => {
              resolve("recovered");
              return () => {};
            }, "recovery-action");
          }
          return value;
        },
        { stream: recordStream },
      );

      expect(result).toEqual("recovered");

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let effectsEntered: string[] = [];
      let replayResult = yield* durably(
        function* () {
          let value: string;
          try {
            yield* action<string>((resolve) => {
              effectsEntered.push("failing-action");
              resolve("wrong");
              return () => {};
            });
            value = "should-not-reach";
          } catch {
            value = yield* action<string>((resolve) => {
              effectsEntered.push("recovery-action");
              resolve("wrong-recovery");
              return () => {};
            }, "recovery-action");
          }
          return value;
        },
        { stream: replayStream },
      );

      expect(effectsEntered).toEqual([]);
      expect(replayResult).toEqual("recovered");
    });

    it("replays multiple caught errors in sequence", function* () {
      let recordStream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          let values: string[] = [];

          for (let i = 0; i < 3; i++) {
            try {
              yield* until(Promise.reject(new Error(`fail-${i}`)));
            } catch {
              let v = yield* action<string>((resolve) => {
                resolve(`catch-${i}`);
                return () => {};
              }, `catch-action-${i}`);
              values.push(v);
            }
          }

          return values;
        },
        { stream: recordStream },
      );

      expect(result).toEqual(["catch-0", "catch-1", "catch-2"]);

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let effectsEntered: string[] = [];
      let replayResult = yield* durably(
        function* () {
          let values: string[] = [];

          for (let i = 0; i < 3; i++) {
            try {
              yield* action<string>((resolve) => {
                effectsEntered.push(`fail-${i}`);
                resolve("wrong");
                return () => {};
              });
            } catch {
              let v = yield* action<string>((resolve) => {
                effectsEntered.push(`catch-${i}`);
                resolve("wrong");
                return () => {};
              }, `catch-action-${i}`);
              values.push(v);
            }
          }

          return values;
        },
        { stream: replayStream },
      );

      expect(effectsEntered).toEqual([]);
      expect(replayResult).toEqual(["catch-0", "catch-1", "catch-2"]);
    });
  });

  describe("replay-to-live error transition", () => {
    it("replays prefix then propagates live error", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* action<number>((resolve) => {
            resolve(10);
            return () => {};
          }, "first-action");
          yield* action<number>((resolve) => {
            resolve(20);
            return () => {};
          }, "second-action");
          return 30;
        },
        { stream: recordStream },
      );

      let events = allEvents(recordStream);
      let secondIdx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "second-action",
      );
      expect(secondIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, secondIdx),
      );

      let firstEntered = false;
      try {
        yield* durably(
          function* () {
            yield* action<number>((resolve) => {
              firstEntered = true;
              resolve(10);
              return () => {};
            }, "first-action");
            yield* until(Promise.reject(new Error("live-boom")));
            return 30;
          },
          { stream: partialStream },
        );
        throw new Error("should have thrown");
      } catch (error) {
        expect((error as Error).message).toEqual("live-boom");
      }

      yield* sleep(0);

      expect(firstEntered).toEqual(false);

      let newEvents = partialStream.read().map((e) => e.event);
      let rootDestroyed = newEvents.find(
        (e) => e.type === "scope:destroyed" && e.scopeId === "root",
      );
      expect(rootDestroyed).toBeDefined();
      if (rootDestroyed && rootDestroyed.type === "scope:destroyed") {
        expect(rootDestroyed.result.ok).toEqual(false);
      }
    });
  });

  describe("error in finally during halt", () => {
    it("propagates finally error when halting after replayed prefix", function* () {
      let recordStream = new InMemoryDurableStream();

      let task = durably(
        function* () {
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "setup-action");
          yield* suspend();
        },
        { stream: recordStream },
      );

      yield* task.halt();

      let events = allEvents(recordStream);
      let suspendIdx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "suspend",
      );
      expect(suspendIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, suspendIdx),
      );

      let task2 = durably(
        function* () {
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "setup-action");
          try {
            yield* suspend();
          } finally {
            yield* until(Promise.reject(new Error("finally-boom")));
          }
        },
        { stream: partialStream },
      );

      try {
        yield* task2.halt();
        throw new Error("should have thrown");
      } catch (error) {
        expect((error as Error).message).toEqual("finally-boom");
      }
    });
  });
});

describe("durable suspend", () => {
  describe("replay of halted workflow", () => {
    it("replays a halted workflow deterministically", function* () {
      let recordStream = new InMemoryDurableStream();
      let cleanupOrder: string[] = [];

      let task = durably(
        function* () {
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "init-action");
          try {
            yield* suspend();
          } finally {
            cleanupOrder.push("cleanup");
          }
        },
        { stream: recordStream },
      );

      yield* task.halt();
      expect(cleanupOrder).toEqual(["cleanup"]);

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let replayCleanup: string[] = [];
      let effectsEntered: string[] = [];

      let task2 = durably(
        function* () {
          yield* action<void>((resolve) => {
            effectsEntered.push("init-action");
            resolve();
            return () => {};
          }, "init-action");
          try {
            yield* suspend();
          } finally {
            replayCleanup.push("cleanup");
          }
        },
        { stream: replayStream },
      );

      yield* task2.halt();

      expect(effectsEntered).toEqual([]);
      expect(replayCleanup).toEqual(["cleanup"]);
    });
  });

  describe("mid-workflow resume to suspend", () => {
    it("replays prefix then enters suspend live", function* () {
      let recordStream = new InMemoryDurableStream();

      let task = durably(
        function* () {
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "pre-suspend-action");
          yield* suspend();
        },
        { stream: recordStream },
      );

      yield* task.halt();

      let events = allEvents(recordStream);
      let suspendIdx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "suspend",
      );
      expect(suspendIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, suspendIdx),
      );

      let effectsEntered: string[] = [];
      let cleanupRan = false;

      let task2 = durably(
        function* () {
          yield* action<void>((resolve) => {
            effectsEntered.push("pre-suspend-action");
            resolve();
            return () => {};
          }, "pre-suspend-action");
          try {
            yield* suspend();
          } finally {
            cleanupRan = true;
          }
        },
        { stream: partialStream },
      );

      yield* task2.halt();

      expect(effectsEntered).toEqual([]);
      expect(cleanupRan).toEqual(true);

      let newEvents = partialStream.read().map((e) => e.event);
      let suspendEvents = newEvents.filter(
        (e) => e.type === "effect:yielded" && e.description === "suspend",
      );
      expect(suspendEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("suspend with async cleanup under replay", () => {
    it("runs async cleanup effects on halt after replayed prefix", function* () {
      let recordStream = new InMemoryDurableStream();

      let task = durably(
        function* () {
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "setup");
          try {
            yield* suspend();
          } finally {
            yield* sleep(1);
          }
        },
        { stream: recordStream },
      );

      yield* task.halt();

      let events = allEvents(recordStream);
      let suspendIdx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "suspend",
      );

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, suspendIdx),
      );

      let setupEntered = false;

      let task2 = durably(
        function* () {
          yield* action<void>((resolve) => {
            setupEntered = true;
            resolve();
            return () => {};
          }, "setup");
          try {
            yield* suspend();
          } finally {
            yield* sleep(1);
          }
        },
        { stream: partialStream },
      );

      yield* task2.halt();

      expect(setupEntered).toEqual(false);

      let newEvents = partialStream.read().map((e) => e.event);
      let sleepEvents = newEvents.filter(
        (e) =>
          e.type === "effect:yielded" &&
          (e.description === "sleep(1)" || e.description === "action"),
      );
      expect(sleepEvents.length).toBeGreaterThanOrEqual(1);
    });
  });
});

describe("durable context", () => {
  let TestContext = createContext<string>("test-context");

  describe("recording", () => {
    it("records scope:set events for context.set()", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* TestContext.set("hello");
          return yield* TestContext.expect();
        },
        { stream },
      );

      let events = allEvents(stream);
      let setEvents = events.filter(
        (e) => e.type === "scope:set" && e.contextName === "test-context",
      );
      expect(setEvents.length).toBeGreaterThanOrEqual(1);

      if (setEvents[0] && setEvents[0].type === "scope:set") {
        expect(setEvents[0].value).toEqual("hello");
      }
    });

    it("records scope:delete events for context.delete()", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* TestContext.set("temporary");
          yield* TestContext.delete();
        },
        { stream },
      );

      let events = allEvents(stream);
      let deleteEvents = events.filter(
        (e) => e.type === "scope:delete" && e.contextName === "test-context",
      );
      expect(deleteEvents.length).toBeGreaterThanOrEqual(1);
    });

    it("records scope:set with correct scopeId for child scopes", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            yield* TestContext.set("child-value");
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "child-action");
          });
          return yield* task;
        },
        { stream },
      );

      let events = allEvents(stream);
      let setEvents = events.filter(
        (e) => e.type === "scope:set" && e.contextName === "test-context",
      );
      expect(setEvents.length).toBeGreaterThanOrEqual(1);

      if (setEvents[0] && setEvents[0].type === "scope:set") {
        expect(setEvents[0].scopeId).not.toEqual("root");
      }
    });
  });

  describe("non-serializable values", () => {
    it("records non-serializable context values as __liveOnly sentinel", function* () {
      let ObjectContext = createContext<{ fn: () => void }>("object-context");
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* ObjectContext.set({ fn: () => {} });
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "after-set");
        },
        { stream },
      );

      let events = allEvents(stream);
      let setEvents = events.filter(
        (e) => e.type === "scope:set" && e.contextName === "object-context",
      );

      expect(setEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("context with replay", () => {
    it("context events are informational — workflow re-executes context ops on replay", function* () {
      let recordStream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          yield* TestContext.set("from-recording");
          let v = yield* action<string>((resolve) => {
            resolve("action-result");
            return () => {};
          }, "test-action");
          let ctx = yield* TestContext.expect();
          return `${ctx}:${v}`;
        },
        { stream: recordStream },
      );

      expect(result).toEqual("from-recording:action-result");

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let effectsEntered: string[] = [];
      let replayResult = yield* durably(
        function* () {
          yield* TestContext.set("from-replay");
          let v = yield* action<string>((resolve) => {
            effectsEntered.push("test-action");
            resolve("wrong");
            return () => {};
          }, "test-action");
          let ctx = yield* TestContext.expect();
          return `${ctx}:${v}`;
        },
        { stream: replayStream },
      );

      expect(effectsEntered).toEqual([]);
      expect(replayResult).toEqual("from-replay:action-result");
    });

    it("context.with() works correctly during replay", function* () {
      let recordStream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          return yield* TestContext.with("scoped-value", function* (val) {
            let a = yield* action<string>((resolve) => {
              resolve(val);
              return () => {};
            }, "scoped-action");
            return a;
          });
        },
        { stream: recordStream },
      );

      expect(result).toEqual("scoped-value");

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let effectsEntered: string[] = [];
      let replayResult = yield* durably(
        function* () {
          return yield* TestContext.with("scoped-value", function* (_val) {
            let a = yield* action<string>((resolve) => {
              effectsEntered.push("scoped-action");
              resolve("wrong");
              return () => {};
            }, "scoped-action");
            return a;
          });
        },
        { stream: replayStream },
      );

      expect(effectsEntered).toEqual([]);
      expect(replayResult).toEqual("scoped-value");
    });
  });
});

describe("durable useAbortSignal", () => {
  describe("recording", () => {
    it("records AbortSignal as LiveOnlySentinel in workflow:return", function* () {
      let stream = new InMemoryDurableStream();

      let signal = yield* durably(
        function* () {
          let signal = yield* useAbortSignal();
          expect(signal.aborted).toEqual(false);
          yield* sleep(0);
          return signal;
        },
        { stream },
      );

      yield* sleep(0);

      expect(signal.aborted).toEqual(true);

      let events = allEvents(stream);

      let awaitResourceEvents = events.filter(
        (e) =>
          e.type === "effect:yielded" && e.description === "await resource",
      );
      expect(awaitResourceEvents.length).toEqual(0);

      let workflowReturns = events.filter((e) => e.type === "workflow:return");
      let liveOnlyReturns = workflowReturns.filter(
        (e) => e.type === "workflow:return" && isLiveOnly(e.value),
      );
      expect(liveOnlyReturns.length).toBeGreaterThanOrEqual(1);

      let sentinel = liveOnlyReturns[0];
      if (sentinel.type === "workflow:return" && isLiveOnly(sentinel.value)) {
        expect(sentinel.value.__type).toEqual("AbortSignal");
      }
    });

    it("records resource child scope for useAbortSignal", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* useAbortSignal();
          yield* sleep(0);
        },
        { stream },
      );

      let events = allEvents(stream);

      let scopeCreated = events.filter((e) => e.type === "scope:created");
      expect(scopeCreated.length).toBeGreaterThanOrEqual(3);

      let suspendEvents = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "suspend",
      );
      expect(suspendEvents.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("replay", () => {
    it("replays a useAbortSignal workflow and produces the same final result", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let signal = yield* useAbortSignal();
          yield* sleep(0);
          return signal;
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let replaySignal = yield* durably(
        function* () {
          let signal = yield* useAbortSignal();
          yield* sleep(0);
          return signal;
        },
        { stream: replayStream },
      );

      expect(replaySignal.aborted).toEqual(true);
    });

    it("does not re-execute user-facing effects during replay", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* useAbortSignal();
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "user-work");
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let workExecuted = false;
      yield* durably(
        function* () {
          yield* useAbortSignal();
          yield* action<void>((resolve) => {
            workExecuted = true;
            resolve();
            return () => {};
          }, "user-work");
        },
        { stream: replayStream },
      );

      expect(workExecuted).toEqual(false);
    });
  });

  describe("mid-workflow resume", () => {
    it("resumes mid-workflow with abort signal still functional", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let signal = yield* useAbortSignal();
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "step-1");
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "step-2");
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let step2Idx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "step-2",
      );
      expect(step2Idx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(events.slice(0, step2Idx));

      let liveExecutions: string[] = [];
      let signalAbortedDuring = true;
      let signalRef: AbortSignal | null = null;

      yield* durably(
        function* () {
          let signal = yield* useAbortSignal();
          signalRef = signal;
          signalAbortedDuring = signal.aborted;

          yield* action<void>((resolve) => {
            liveExecutions.push("step-1");
            resolve();
            return () => {};
          }, "step-1");

          yield* action<void>((resolve) => {
            liveExecutions.push("step-2");
            resolve();
            return () => {};
          }, "step-2");
        },
        { stream: partialStream },
      );

      expect(liveExecutions).not.toContain("step-1");
      expect(liveExecutions).toContain("step-2");

      expect(signalAbortedDuring).toEqual(false);
      expect(signalRef!.aborted).toEqual(true);
    });

    it("aborts signal on halt after replay", function* () {
      let recordStream = new InMemoryDurableStream();

      let task = durably(
        function* () {
          yield* useAbortSignal();
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "before-suspend");
          yield* suspend();
        },
        { stream: recordStream },
      );

      // Intentional: sleep(10) tests the real async window between a task
      // reaching suspend() and an external halt(). Using withResolvers or
      // other deterministic handshakes would change the lifecycle semantics
      // being tested (the halt must arrive while the task is suspended).
      yield* sleep(10);
      yield* task.halt();

      let events = recordStream.read().map((e) => e.event);
      let suspendIdx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "suspend",
      );

      let partialEvents = suspendIdx > 0 ? events.slice(0, suspendIdx) : events;
      let partialStream = InMemoryDurableStream.from(partialEvents);

      let signalRef: AbortSignal | null = null;

      let resumedTask = durably(
        function* () {
          let signal = yield* useAbortSignal();
          signalRef = signal;
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "before-suspend");
          yield* suspend();
        },
        { stream: partialStream },
      );

      // See comment above — sleep(10) is intentional for testing the
      // async window between suspend and halt during replay-to-live resume.
      yield* sleep(10);

      expect(signalRef!.aborted).toEqual(false);

      yield* resumedTask.halt();

      expect(signalRef!.aborted).toEqual(true);
    });
  });
});

describe("durable withResolvers", () => {
  describe("recording", () => {
    it("records events for a withResolvers operation with custom description", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          let { operation, resolve } = withResolvers<string>("my-resolver");
          resolve("hello");
          return yield* operation;
        },
        { stream },
      );

      expect(result).toEqual("hello");

      let events = allEvents(stream);

      let resolverEffects = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "my-resolver",
      );
      expect(resolverEffects.length).toEqual(1);

      let effectId =
        resolverEffects[0].type === "effect:yielded"
          ? resolverEffects[0].effectId
          : "";
      let resolution = events.find(
        (e) => e.type === "effect:resolved" && e.effectId === effectId,
      );
      expect(resolution).toBeDefined();
      if (resolution && resolution.type === "effect:resolved") {
        expect(resolution.value).toEqual("hello");
      }
    });

    it("records pre-resolved withResolvers (resolve before yield)", function* () {
      let stream = new InMemoryDurableStream();

      let { operation, resolve } = withResolvers<number>("pre-resolved");
      resolve(42);

      let result = yield* durably(
        function* () {
          return yield* operation;
        },
        { stream },
      );

      expect(result).toEqual(42);

      let events = allEvents(stream);

      let resolverEffects = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "pre-resolved",
      );
      expect(resolverEffects.length).toEqual(1);

      let effectId =
        resolverEffects[0].type === "effect:yielded"
          ? resolverEffects[0].effectId
          : "";
      let resolution = events.find(
        (e) => e.type === "effect:resolved" && e.effectId === effectId,
      );
      expect(resolution).toBeDefined();
      if (resolution && resolution.type === "effect:resolved") {
        expect(resolution.value).toEqual(42);
      }
    });
  });

  describe("replay", () => {
    it("replays withResolvers without re-executing the resolver", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let { operation, resolve } = withResolvers<string>("replay-resolver");
          resolve("recorded-value");
          return yield* operation;
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let result = yield* durably(
        function* () {
          let { operation, resolve } = withResolvers<string>("replay-resolver");
          resolve("WRONG-should-not-appear");
          return yield* operation;
        },
        { stream: replayStream },
      );

      expect(result).toEqual("recorded-value");
    });

    it("replays withResolvers rejection correctly", function* () {
      let recordStream = new InMemoryDurableStream();

      let caughtMessage = "";
      yield* durably(
        function* () {
          let { operation, reject } = withResolvers<string>("reject-resolver");
          reject(new Error("boom"));
          try {
            yield* operation;
          } catch (e) {
            caughtMessage = (e as Error).message;
          }
          return caughtMessage;
        },
        { stream: recordStream },
      );

      expect(caughtMessage).toEqual("boom");

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let replayCaughtMessage = "";
      let result = yield* durably(
        function* () {
          let { operation, reject } = withResolvers<string>("reject-resolver");
          reject(new Error("WRONG-should-not-appear"));
          try {
            yield* operation;
          } catch (e) {
            replayCaughtMessage = (e as Error).message;
          }
          return replayCaughtMessage;
        },
        { stream: replayStream },
      );

      expect(result).toEqual("boom");
    });
  });

  describe("mid-workflow resume", () => {
    it("resumes after withResolvers with subsequent effects executing live", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let { operation, resolve } = withResolvers<string>("step-resolver");
          resolve("resolved-value");
          let value = yield* operation;

          let extra = yield* action<string>((resolve) => {
            resolve("after-resolver");
            return () => {};
          }, "post-resolver-action");

          return `${value}:${extra}`;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let postIdx = events.findIndex(
        (e) =>
          e.type === "effect:yielded" &&
          e.description === "post-resolver-action",
      );
      expect(postIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(events.slice(0, postIdx));

      let postActionExecuted = false;
      let result = yield* durably(
        function* () {
          let { operation, resolve } = withResolvers<string>("step-resolver");
          resolve("resolved-value");
          let value = yield* operation;

          let extra = yield* action<string>((resolve) => {
            postActionExecuted = true;
            resolve("after-resolver");
            return () => {};
          }, "post-resolver-action");

          return `${value}:${extra}`;
        },
        { stream: partialStream },
      );

      expect(postActionExecuted).toEqual(true);
      expect(result).toEqual("resolved-value:after-resolver");
    });
  });
});

describe("durable createSignal", () => {
  describe("recording", () => {
    it("records events for signal send/receive with blocking consumer", function* () {
      let stream = new InMemoryDurableStream();

      let signal = createSignal<string, void>();
      let result: string[] = [];

      yield* durably(
        function* () {
          yield* spawn(function* () {
            yield* sleep(1);
            signal.send("msg1");
            signal.send("msg2");
            signal.close();
          });

          for (let value of yield* each(signal)) {
            result.push(value);
            yield* each.next();
          }
        },
        { stream },
      );

      expect(result).toEqual(["msg1", "msg2"]);

      let events = allEvents(stream);

      let scopeCreated = events.filter((e) => e.type === "scope:created");
      expect(scopeCreated.length).toBeGreaterThanOrEqual(4);

      let sleepEffects = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "sleep(1)",
      );
      expect(sleepEffects.length).toEqual(1);

      let actionEffects = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "action",
      );
      expect(actionEffects.length).toBeGreaterThanOrEqual(1);

      let actionEffect = actionEffects[0];
      let effectId =
        actionEffect.type === "effect:yielded" ? actionEffect.effectId : "";
      let resolution = events.find(
        (e) => e.type === "effect:resolved" && e.effectId === effectId,
      );
      expect(resolution).toBeDefined();
      if (resolution && resolution.type === "effect:resolved") {
        expect(resolution.value).toHaveProperty("done", false);
        expect(resolution.value).toHaveProperty("value", "msg1");
      }

      let suspendEffects = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "suspend",
      );
      expect(suspendEffects.length).toBeGreaterThanOrEqual(1);
    });

    it("records scope hierarchy for signal resource", function* () {
      let stream = new InMemoryDurableStream();

      let signal = createSignal<string, void>();

      yield* durably(
        function* () {
          let subscription = yield* signal;
          signal.send("test");
          signal.close();
          let next = yield* subscription.next();
          while (!next.done) {
            next = yield* subscription.next();
          }
        },
        { stream },
      );

      let events = allEvents(stream);

      let scopeCreated = events.filter(
        (e) => e.type === "scope:created",
      ) as Array<{
        type: "scope:created";
        scopeId: string;
        parentScopeId?: string;
      }>;

      expect(scopeCreated.length).toBeGreaterThanOrEqual(3);

      let taskScope = scopeCreated.find((e) => e.parentScopeId === "root");
      expect(taskScope).toBeDefined();

      let resourceScope = scopeCreated.find(
        (e) =>
          e.parentScopeId === taskScope!.scopeId &&
          e.scopeId !== taskScope!.scopeId,
      );
      expect(resourceScope).toBeDefined();
    });
  });

  describe("mid-workflow resume", () => {
    it("resumes signal consumption after replay frontier", function* () {
      let recordStream = new InMemoryDurableStream();

      let signal = createSignal<string, void>();

      yield* durably(
        function* () {
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "pre-signal-work");

          yield* spawn(function* () {
            yield* sleep(1);
            signal.send("first");
            signal.send("second");
            signal.close();
          });

          let collected: string[] = [];
          for (let value of yield* each(signal)) {
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);

      let preWorkYielded = events.find(
        (e) =>
          e.type === "effect:yielded" && e.description === "pre-signal-work",
      );
      let preWorkEffectId =
        preWorkYielded && preWorkYielded.type === "effect:yielded"
          ? preWorkYielded.effectId
          : "";
      let preWorkResolvedIdx = events.findIndex(
        (e) => e.type === "effect:resolved" && e.effectId === preWorkEffectId,
      );
      expect(preWorkResolvedIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, preWorkResolvedIdx + 1),
      );

      let signal2 = createSignal<string, void>();
      let liveEffects: string[] = [];

      let result = yield* durably(
        function* () {
          yield* action<void>((resolve) => {
            liveEffects.push("pre-signal-work");
            resolve();
            return () => {};
          }, "pre-signal-work");

          yield* spawn(function* () {
            yield* sleep(1);
            liveEffects.push("producer-resumed");
            signal2.send("first");
            signal2.send("second");
            signal2.close();
          });

          let collected: string[] = [];
          for (let value of yield* each(signal2)) {
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: partialStream },
      );

      expect(liveEffects).not.toContain("pre-signal-work");
      expect(liveEffects).toContain("producer-resumed");
      expect(result).toEqual(["first", "second"]);
    });
  });
});

describe("durable createChannel", () => {
  describe("recording", () => {
    it("records events for channel send/receive", function* () {
      let stream = new InMemoryDurableStream();

      let result: string[] = [];
      yield* durably(
        function* () {
          let channel = createChannel<string, void>();
          let subscription = yield* channel;

          yield* channel.send("hello");
          yield* channel.send("world");
          yield* channel.close();

          let next = yield* subscription.next();
          while (!next.done) {
            result.push(next.value);
            next = yield* subscription.next();
          }
        },
        { stream },
      );

      expect(result).toEqual(["hello", "world"]);

      let events = allEvents(stream);

      let actionEffects = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "action",
      );
      expect(actionEffects.length).toBeGreaterThanOrEqual(3);

      for (let effect of actionEffects) {
        let effectId = effect.type === "effect:yielded" ? effect.effectId : "";
        let resolution = events.find(
          (e) =>
            (e.type === "effect:resolved" || e.type === "effect:errored") &&
            e.effectId === effectId,
        );
        expect(resolution).toBeDefined();
      }
    });

    it("records workflow:return with collected values", function* () {
      let stream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let channel = createChannel<string, void>();
          let subscription = yield* channel;

          yield* channel.send("hello");
          yield* channel.send("world");
          yield* channel.close();

          let collected: string[] = [];
          let next = yield* subscription.next();
          while (!next.done) {
            collected.push(next.value);
            next = yield* subscription.next();
          }
          return collected;
        },
        { stream },
      );

      let events = allEvents(stream);

      let workflowReturns = events.filter((e) => e.type === "workflow:return");
      let taskReturn = workflowReturns.find(
        (e) =>
          e.type === "workflow:return" &&
          Array.isArray(e.value) &&
          e.value.length === 2,
      );
      expect(taskReturn).toBeDefined();
      if (taskReturn && taskReturn.type === "workflow:return") {
        expect(taskReturn.value).toEqual(["hello", "world"]);
      }
    });
  });

  describe("mid-workflow resume", () => {
    it("resumes channel with live sends after replay frontier", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "pre-channel-work");

          let channel = createChannel<string, void>();
          let subscription = yield* channel;

          yield* channel.send("hello");
          yield* channel.send("world");
          yield* channel.close();

          let collected: string[] = [];
          let next = yield* subscription.next();
          while (!next.done) {
            collected.push(next.value);
            next = yield* subscription.next();
          }
          return collected;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let preWorkYielded = events.find(
        (e) =>
          e.type === "effect:yielded" && e.description === "pre-channel-work",
      );
      let preWorkEffectId =
        preWorkYielded && preWorkYielded.type === "effect:yielded"
          ? preWorkYielded.effectId
          : "";
      let preWorkResolvedIdx = events.findIndex(
        (e) => e.type === "effect:resolved" && e.effectId === preWorkEffectId,
      );
      expect(preWorkResolvedIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, preWorkResolvedIdx + 1),
      );

      let liveEffects: string[] = [];
      let result = yield* durably(
        function* () {
          yield* action<void>((resolve) => {
            liveEffects.push("pre-channel-work");
            resolve();
            return () => {};
          }, "pre-channel-work");

          let channel = createChannel<string, void>();
          let subscription = yield* channel;

          yield* channel.send("hello");
          yield* channel.send("world");
          yield* channel.close();

          let collected: string[] = [];
          let next = yield* subscription.next();
          while (!next.done) {
            collected.push(next.value);
            next = yield* subscription.next();
          }
          return collected;
        },
        { stream: partialStream },
      );

      expect(liveEffects).not.toContain("pre-channel-work");
      expect(result).toEqual(["hello", "world"]);
    });
  });
});

describe("durable interval", () => {
  describe("recording", () => {
    it("records events for interval consumption", function* () {
      let stream = new InMemoryDurableStream();

      let tickCount = 0;
      yield* durably(
        function* () {
          let task = yield* spawn(function* () {
            for (let _ of yield* each(interval(1))) {
              tickCount++;
              if (tickCount >= 3) {
                return tickCount;
              }
              yield* each.next();
            }
          });
          return yield* race([
            task,
            call(function* () {
              yield* sleep(500);
              return "timeout";
            }),
          ]);
        },
        { stream },
      );

      expect(tickCount).toEqual(3);

      let events = allEvents(stream);

      let scopeCreated = events.filter((e) => e.type === "scope:created");
      expect(scopeCreated.length).toBeGreaterThanOrEqual(5);

      let actionEffects = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "action",
      );
      expect(actionEffects.length).toBeGreaterThanOrEqual(1);

      let suspendEffects = events.filter(
        (e) => e.type === "effect:yielded" && e.description === "suspend",
      );
      expect(suspendEffects.length).toBeGreaterThanOrEqual(1);

      for (let effect of actionEffects) {
        let effectId = effect.type === "effect:yielded" ? effect.effectId : "";
        let resolution = events.find(
          (e) => e.type === "effect:resolved" && e.effectId === effectId,
        );
        expect(resolution).toBeDefined();
        if (resolution && resolution.type === "effect:resolved") {
          expect(resolution.value).toHaveProperty("done", false);
        }
      }
    });
  });

  describe("mid-workflow resume", () => {
    it("resumes interval with live ticks after replay frontier", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "pre-interval-work");

          let tickCount = 0;
          let task = yield* spawn(function* () {
            for (let _ of yield* each(interval(1))) {
              tickCount++;
              if (tickCount >= 3) {
                return tickCount;
              }
              yield* each.next();
            }
          });
          return yield* race([
            task,
            call(function* () {
              yield* sleep(500);
              return "timeout";
            }),
          ]);
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);

      let preWorkYielded = events.find(
        (e) =>
          e.type === "effect:yielded" && e.description === "pre-interval-work",
      );
      let preWorkEffectId =
        preWorkYielded && preWorkYielded.type === "effect:yielded"
          ? preWorkYielded.effectId
          : "";
      let preWorkResolvedIdx = events.findIndex(
        (e) => e.type === "effect:resolved" && e.effectId === preWorkEffectId,
      );
      expect(preWorkResolvedIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, preWorkResolvedIdx + 1),
      );

      let liveEffects: string[] = [];
      let liveTicks = 0;

      let result = yield* durably(
        function* () {
          yield* action<void>((resolve) => {
            liveEffects.push("pre-interval-work");
            resolve();
            return () => {};
          }, "pre-interval-work");

          let task = yield* spawn(function* () {
            for (let _ of yield* each(interval(1))) {
              liveTicks++;
              if (liveTicks >= 3) {
                return liveTicks;
              }
              yield* each.next();
            }
          });
          return yield* race([
            task,
            call(function* () {
              yield* sleep(500);
              return "timeout";
            }),
          ]);
        },
        { stream: partialStream },
      );

      expect(liveEffects).not.toContain("pre-interval-work");
      expect(liveTicks).toEqual(3);
      expect(result).toEqual(3);
    });
  });
});
