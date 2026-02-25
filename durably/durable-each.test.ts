import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { action, each, sleep, spawn } from "effection";
import type { Operation, Stream } from "effection";
import type { DurableEvent } from "./mod.ts";
import { durably, InMemoryDurableStream } from "./mod.ts";
import { allEvents } from "./test-helpers.ts";

function asyncSequence(...values: string[]): Stream<string, void> {
  return {
    *[Symbol.iterator]() {
      let items = values.slice();
      let index = 0;
      return {
        *next(): Operation<IteratorResult<string, void>> {
          let value = items.shift();
          if (typeof value !== "undefined") {
            let result = yield* action<string>((resolve) => {
              resolve(value);
              return () => {};
            }, `stream-item-${index++}`);
            return { done: false, value: result };
          } else {
            return { done: true, value: undefined };
          }
        },
      };
    },
  };
}

function syncSequence(...values: string[]): Stream<string, void> {
  return {
    *[Symbol.iterator]() {
      let items = values.slice();
      return {
        *next(): Operation<IteratorResult<string, void>> {
          let value = items.shift();
          if (typeof value !== "undefined") {
            return { done: false, value };
          } else {
            return { done: true, value: undefined };
          }
        },
      };
    },
  };
}

describe("durable each", () => {
  describe("recording", () => {
    it("records events for each() over an async stream", function* () {
      let stream = new InMemoryDurableStream();

      let result: string[] = [];
      yield* durably(
        function* () {
          let seq = asyncSequence("alpha", "beta", "gamma");
          for (let value of yield* each(seq)) {
            result.push(value);
            yield* each.next();
          }
        },
        { stream },
      );

      expect(result).toEqual(["alpha", "beta", "gamma"]);

      let events = allEvents(stream);
      let streamItems = events.filter(
        (e) =>
          e.type === "effect:yielded" &&
          e.description.startsWith("stream-item-"),
      );
      expect(streamItems.length).toEqual(3);

      let resolutions = events.filter((e) => e.type === "effect:resolved");
      let itemResolutions = resolutions.filter((r) => {
        let yielded = streamItems.find(
          (y) =>
            y.type === "effect:yielded" &&
            r.type === "effect:resolved" &&
            y.effectId === r.effectId,
        );
        return !!yielded;
      });
      expect(itemResolutions.length).toBeGreaterThanOrEqual(3);
    });

    it("records events for each() over a synchronous stream", function* () {
      let stream = new InMemoryDurableStream();

      let result: string[] = [];
      yield* durably(
        function* () {
          let seq = syncSequence("one", "two");
          for (let value of yield* each(seq)) {
            result.push(value);
            yield* each.next();
          }
        },
        { stream },
      );

      expect(result).toEqual(["one", "two"]);

      let events = allEvents(stream);
      let userEffects = events.filter((e) => e.type === "effect:yielded");
      expect(userEffects.length).toEqual(0);
    });
  });

  describe("replay", () => {
    it("replays each() without re-executing effects", function* () {
      let recordStream = new InMemoryDurableStream();

      let recordedValues: string[] = [];
      yield* durably(
        function* () {
          let seq = asyncSequence("alpha", "beta", "gamma");
          for (let value of yield* each(seq)) {
            recordedValues.push(value);
            yield* each.next();
          }
        },
        { stream: recordStream },
      );

      expect(recordedValues).toEqual(["alpha", "beta", "gamma"]);

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let effectsEntered: string[] = [];
      let replayedValues: string[] = [];

      let trackingStream: Stream<string, void> = {
        *[Symbol.iterator]() {
          let items = ["alpha", "beta", "gamma"].slice();
          let index = 0;
          return {
            *next(): Operation<IteratorResult<string, void>> {
              let value = items.shift();
              if (typeof value !== "undefined") {
                let result = yield* action<string>((resolve) => {
                  effectsEntered.push(`stream-item-${index}`);
                  resolve(value);
                  return () => {};
                }, `stream-item-${index++}`);
                return { done: false, value: result };
              } else {
                return { done: true, value: undefined };
              }
            },
          };
        },
      };

      let initialEventCount = replayStream.length;

      yield* durably(
        function* () {
          for (let value of yield* each(trackingStream)) {
            replayedValues.push(value);
            yield* each.next();
          }
        },
        { stream: replayStream },
      );

      expect(effectsEntered).toEqual([]);
      let newEvents = replayStream.read(initialEventCount).map((e) => e.event);
      let newEffectYields = newEvents.filter(
        (e) => e.type === "effect:yielded",
      );
      expect(newEffectYields.length).toEqual(0);
      expect(replayedValues).toEqual(["alpha", "beta", "gamma"]);
    });

    it("replays each() and produces the same collected values", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let seq = asyncSequence("x", "y", "z");
          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let effectsEntered: string[] = [];
      let result = yield* durably(
        function* () {
          let seq: Stream<string, void> = {
            *[Symbol.iterator]() {
              let items = ["WRONG1", "WRONG2", "WRONG3"].slice();
              let index = 0;
              return {
                *next(): Operation<IteratorResult<string, void>> {
                  let value = items.shift();
                  if (typeof value !== "undefined") {
                    let result = yield* action<string>((resolve) => {
                      effectsEntered.push(value);
                      resolve(value);
                      return () => {};
                    }, `stream-item-${index++}`);
                    return { done: false, value: result };
                  } else {
                    return { done: true, value: undefined };
                  }
                },
              };
            },
          };

          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: replayStream },
      );

      expect(effectsEntered).toEqual([]);
      expect(result).toEqual(["x", "y", "z"]);
    });
  });

  describe("mid-workflow resume", () => {
    it("resumes mid-stream with subsequent items executing live", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let seq = asyncSequence("a", "b", "c");
          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let thirdItemIdx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "stream-item-2",
      );
      expect(thirdItemIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, thirdItemIdx),
      );

      let liveExecutions: string[] = [];
      let result = yield* durably(
        function* () {
          let seq: Stream<string, void> = {
            *[Symbol.iterator]() {
              let items = ["a", "b", "c"].slice();
              let index = 0;
              return {
                *next(): Operation<IteratorResult<string, void>> {
                  let value = items.shift();
                  if (typeof value !== "undefined") {
                    let result = yield* action<string>((resolve) => {
                      liveExecutions.push(value);
                      resolve(value);
                      return () => {};
                    }, `stream-item-${index++}`);
                    return { done: false, value: result };
                  } else {
                    return { done: true, value: undefined };
                  }
                },
              };
            },
          };

          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: partialStream },
      );

      expect(liveExecutions).toContain("c");
      expect(liveExecutions).not.toContain("a");
      expect(liveExecutions).not.toContain("b");
      expect(result).toEqual(["a", "b", "c"]);
    });

    it("resumes after each() completes with subsequent live effects", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let seq = asyncSequence("hello", "world");
          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            collected.push(value);
            yield* each.next();
          }
          let extra = yield* action<string>((resolve) => {
            resolve("after-each");
            return () => {};
          }, "post-each-action");
          return [...collected, extra];
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let postIdx = events.findIndex(
        (e) =>
          e.type === "effect:yielded" && e.description === "post-each-action",
      );
      expect(postIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(events.slice(0, postIdx));

      let postEachExecuted = false;
      let result = yield* durably(
        function* () {
          let seq = asyncSequence("hello", "world");
          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            collected.push(value);
            yield* each.next();
          }
          let extra = yield* action<string>((resolve) => {
            postEachExecuted = true;
            resolve("after-each");
            return () => {};
          }, "post-each-action");
          return [...collected, extra];
        },
        { stream: partialStream },
      );

      expect(postEachExecuted).toEqual(true);
      expect(result).toEqual(["hello", "world", "after-each"]);
    });
  });

  describe("synchronous streams", () => {
    it("records and replays each() with a synchronous stream", function* () {
      let recordStream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          let seq = syncSequence("one", "two", "three");
          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: recordStream },
      );

      expect(result).toEqual(["one", "two", "three"]);

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let replayResult = yield* durably(
        function* () {
          let seq = syncSequence("one", "two", "three");
          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: replayStream },
      );

      expect(replayResult).toEqual(["one", "two", "three"]);
    });
  });

  describe("loop body operations", () => {
    it("records loop-body effects with the caller scope's scopeId", function* () {
      let stream = new InMemoryDurableStream();

      let result: string[] = [];
      yield* durably(
        function* () {
          let seq = asyncSequence("alpha", "beta", "gamma");
          for (let value of yield* each(seq)) {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, `process-${value}`);
            result.push(value);
            yield* each.next();
          }
        },
        { stream },
      );

      expect(result).toEqual(["alpha", "beta", "gamma"]);

      let events = allEvents(stream);
      let bodyEffects = events.filter(
        (e) =>
          e.type === "effect:yielded" && e.description.startsWith("process-"),
      );
      expect(bodyEffects.length).toEqual(3);
      expect(
        bodyEffects.map((e) =>
          e.type === "effect:yielded" ? e.description : "",
        ),
      ).toEqual(["process-alpha", "process-beta", "process-gamma"]);

      let streamEffects = events.filter(
        (e) =>
          e.type === "effect:yielded" &&
          e.description.startsWith("stream-item-"),
      );
      expect(streamEffects.length).toEqual(3);

      let callerScopeStreamEffects = streamEffects.filter(
        (e) => e.type === "effect:yielded" && e.description !== "stream-item-0",
      );

      let bodyScopes = bodyEffects.map((e) =>
        e.type === "effect:yielded" ? e.scopeId : "",
      );
      expect(new Set(bodyScopes).size).toEqual(1);

      if (callerScopeStreamEffects.length > 0) {
        let callerScopeId =
          callerScopeStreamEffects[0].type === "effect:yielded"
            ? callerScopeStreamEffects[0].scopeId
            : "";
        expect(bodyScopes[0]).toEqual(callerScopeId);
      }

      let callerScopeId = bodyScopes[0];
      let callerEffects = events.filter(
        (e) => e.type === "effect:yielded" && e.scopeId === callerScopeId,
      );
      let callerDescs = callerEffects.map((e) =>
        e.type === "effect:yielded" ? e.description : "",
      );

      let processIdx0 = callerDescs.indexOf("process-alpha");
      let streamIdx1 = callerDescs.indexOf("stream-item-1");
      expect(processIdx0).toBeLessThan(streamIdx1);

      let processIdx1 = callerDescs.indexOf("process-beta");
      let streamIdx2 = callerDescs.indexOf("stream-item-2");
      expect(processIdx1).toBeLessThan(streamIdx2);
    });

    it("replays loop-body effects without re-executing them", function* () {
      let recordStream = new InMemoryDurableStream();

      let recordedValues: string[] = [];
      yield* durably(
        function* () {
          let seq = asyncSequence("alpha", "beta");
          for (let value of yield* each(seq)) {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, `process-${value}`);
            recordedValues.push(value);
            yield* each.next();
          }
        },
        { stream: recordStream },
      );

      expect(recordedValues).toEqual(["alpha", "beta"]);

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let effectsEntered: string[] = [];
      let replayedValues: string[] = [];
      let initialEventCount = replayStream.length;

      yield* durably(
        function* () {
          let trackingSeq: Stream<string, void> = {
            *[Symbol.iterator]() {
              let items = ["alpha", "beta"].slice();
              let index = 0;
              return {
                *next(): Operation<IteratorResult<string, void>> {
                  let value = items.shift();
                  if (typeof value !== "undefined") {
                    let result = yield* action<string>((resolve) => {
                      effectsEntered.push(`stream-item-${index}`);
                      resolve(value);
                      return () => {};
                    }, `stream-item-${index++}`);
                    return { done: false, value: result };
                  } else {
                    return { done: true, value: undefined };
                  }
                },
              };
            },
          };

          for (let value of yield* each(trackingSeq)) {
            yield* action<void>((resolve) => {
              effectsEntered.push(`process-${value}`);
              resolve();
              return () => {};
            }, `process-${value}`);
            replayedValues.push(value);
            yield* each.next();
          }
        },
        { stream: replayStream },
      );

      expect(effectsEntered).toEqual([]);

      let newEvents = replayStream.read(initialEventCount).map((e) => e.event);
      let newEffectYields = newEvents.filter(
        (e) => e.type === "effect:yielded",
      );
      expect(newEffectYields.length).toEqual(0);

      expect(replayedValues).toEqual(["alpha", "beta"]);
    });

    it("resumes mid-loop-body with each.next() executing live", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let seq = asyncSequence("a", "b", "c");
          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, `process-${value}`);
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let processBIdx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "process-b",
      );
      expect(processBIdx).toBeGreaterThan(0);

      let processBEvent = events[processBIdx];
      let processBEffectId =
        processBEvent.type === "effect:yielded" ? processBEvent.effectId : "";
      let processBResolvedIdx = events.findIndex(
        (e) => e.type === "effect:resolved" && e.effectId === processBEffectId,
      );
      expect(processBResolvedIdx).toBeGreaterThan(processBIdx);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, processBResolvedIdx + 1),
      );

      let liveExecutions: string[] = [];
      let result = yield* durably(
        function* () {
          let seq: Stream<string, void> = {
            *[Symbol.iterator]() {
              let items = ["a", "b", "c"].slice();
              let index = 0;
              return {
                *next(): Operation<IteratorResult<string, void>> {
                  let value = items.shift();
                  if (typeof value !== "undefined") {
                    let idx = index;
                    let desc = `stream-item-${index++}`;
                    let result = yield* action<string>((resolve) => {
                      liveExecutions.push(`stream-item-${idx}`);
                      resolve(value);
                      return () => {};
                    }, desc);
                    return { done: false, value: result };
                  } else {
                    return { done: true, value: undefined };
                  }
                },
              };
            },
          };

          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            yield* action<void>((resolve) => {
              liveExecutions.push(`process-${value}`);
              resolve();
              return () => {};
            }, `process-${value}`);
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: partialStream },
      );

      expect(liveExecutions).not.toContain("process-a");
      expect(liveExecutions).not.toContain("process-b");

      expect(liveExecutions).not.toContain("stream-item-0");
      expect(liveExecutions).not.toContain("stream-item-1");
      expect(liveExecutions).toContain("stream-item-2");

      expect(liveExecutions).toContain("process-c");

      expect(result).toEqual(["a", "b", "c"]);
    });

    it("resumes between iterations with next body effect executing live", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let seq = asyncSequence("a", "b", "c");
          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, `process-${value}`);
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);

      let streamItem1Idx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "stream-item-1",
      );
      expect(streamItem1Idx).toBeGreaterThan(0);

      let streamItem1Event = events[streamItem1Idx];
      let streamItem1EffectId =
        streamItem1Event.type === "effect:yielded"
          ? streamItem1Event.effectId
          : "";
      let streamItem1ResolvedIdx = events.findIndex(
        (e) =>
          e.type === "effect:resolved" && e.effectId === streamItem1EffectId,
      );
      expect(streamItem1ResolvedIdx).toBeGreaterThan(streamItem1Idx);

      let partialStream = InMemoryDurableStream.from(
        events.slice(0, streamItem1ResolvedIdx + 1),
      );

      let liveExecutions: string[] = [];
      let result = yield* durably(
        function* () {
          let seq: Stream<string, void> = {
            *[Symbol.iterator]() {
              let items = ["a", "b", "c"].slice();
              let index = 0;
              return {
                *next(): Operation<IteratorResult<string, void>> {
                  let value = items.shift();
                  if (typeof value !== "undefined") {
                    let idx = index;
                    let desc = `stream-item-${index++}`;
                    let result = yield* action<string>((resolve) => {
                      liveExecutions.push(`stream-item-${idx}`);
                      resolve(value);
                      return () => {};
                    }, desc);
                    return { done: false, value: result };
                  } else {
                    return { done: true, value: undefined };
                  }
                },
              };
            },
          };

          let collected: string[] = [];
          for (let value of yield* each(seq)) {
            yield* action<void>((resolve) => {
              liveExecutions.push(`process-${value}`);
              resolve();
              return () => {};
            }, `process-${value}`);
            collected.push(value);
            yield* each.next();
          }
          return collected;
        },
        { stream: partialStream },
      );

      expect(liveExecutions).not.toContain("process-a");
      expect(liveExecutions).not.toContain("stream-item-0");
      expect(liveExecutions).not.toContain("stream-item-1");

      expect(liveExecutions).toContain("process-b");
      expect(liveExecutions).toContain("process-c");

      expect(result).toEqual(["a", "b", "c"]);
    });

    it("records spawned child scopes from loop body under caller scope", function* () {
      let stream = new InMemoryDurableStream();

      let result: string[] = [];
      yield* durably(
        function* () {
          let seq = asyncSequence("x", "y");
          for (let value of yield* each(seq)) {
            let task = yield* spawn(function* () {
              yield* sleep(0);
              return `spawned-${value}`;
            });
            let spawned = yield* task;
            result.push(spawned);
            yield* each.next();
          }
        },
        { stream },
      );

      expect(result).toEqual(["spawned-x", "spawned-y"]);

      let events = allEvents(stream);

      let scopeCreations = events.filter(
        (e) => e.type === "scope:created" && e.scopeId !== "root",
      ) as Array<{
        type: "scope:created";
        scopeId: string;
        parentScopeId?: string;
      }>;

      let taskScope = scopeCreations[0];
      expect(taskScope.parentScopeId).toEqual("root");
      let callerScopeId = taskScope.scopeId;

      let childScopes = scopeCreations.slice(1);
      expect(childScopes.length).toBeGreaterThanOrEqual(3);

      for (let scope of childScopes) {
        expect(scope.parentScopeId).toEqual(callerScopeId);
      }

      let subscriptionScope = childScopes[0];
      let spawnedScopes = childScopes.slice(1);
      expect(spawnedScopes.length).toEqual(2);
      for (let scope of spawnedScopes) {
        expect(scope.parentScopeId).toEqual(subscriptionScope.parentScopeId);
      }

      let replayStream = InMemoryDurableStream.from(recordedEvents(stream));

      let effectsEntered: string[] = [];
      let replayResult: string[] = [];

      yield* durably(
        function* () {
          let trackingSeq: Stream<string, void> = {
            *[Symbol.iterator]() {
              let items = ["x", "y"].slice();
              let index = 0;
              return {
                *next(): Operation<IteratorResult<string, void>> {
                  let value = items.shift();
                  if (typeof value !== "undefined") {
                    let result = yield* action<string>((resolve) => {
                      effectsEntered.push(`stream-item-${index}`);
                      resolve(value);
                      return () => {};
                    }, `stream-item-${index++}`);
                    return { done: false, value: result };
                  } else {
                    return { done: true, value: undefined };
                  }
                },
              };
            },
          };

          for (let value of yield* each(trackingSeq)) {
            let task = yield* spawn(function* () {
              yield* action<void>((resolve) => {
                effectsEntered.push(`sleep-${value}`);
                resolve();
                return () => {};
              }, "sleep(0)");
              return `spawned-${value}`;
            });
            let spawned = yield* task;
            replayResult.push(spawned);
            yield* each.next();
          }
        },
        { stream: replayStream },
      );

      expect(effectsEntered).toEqual([]);
      expect(replayResult).toEqual(["spawned-x", "spawned-y"]);
    });
  });
});

function recordedEvents(stream: InMemoryDurableStream): DurableEvent[] {
  return stream.read().map((e) => e.event);
}
