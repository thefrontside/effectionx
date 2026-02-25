import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { action, ensure, resource, sleep, spawn } from "effection";
import { durably, InMemoryDurableStream } from "./mod.ts";
import { allEvents } from "./test-helpers.ts";

describe("durable resource", () => {
  describe("basic resource recording", () => {
    it("records events for a simple resource that provides a value", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          let value = yield* resource(function* (provide) {
            yield* provide(42);
          });
          return value;
        },
        { stream },
      );

      expect(result).toEqual(42);

      let events = allEvents(stream);
      expect(events.length).toBeGreaterThan(0);

      let scopeCreated = events.filter((e) => e.type === "scope:created");
      let scopeDestroyed = events.filter((e) => e.type === "scope:destroyed");
      expect(scopeCreated.length).toBeGreaterThanOrEqual(1);
      expect(scopeDestroyed.length).toBeGreaterThanOrEqual(1);
    });

    it("records events for a resource with effects before provide", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          let value = yield* resource(function* (provide) {
            let x = yield* action<number>((resolve) => {
              resolve(10);
              return () => {};
            }, "resource-init");
            yield* provide(x * 2);
          });
          return value;
        },
        { stream },
      );

      expect(result).toEqual(20);

      let events = allEvents(stream);
      let resourceInit = events.find(
        (e) => e.type === "effect:yielded" && e.description === "resource-init",
      );
      expect(resourceInit).toBeDefined();
    });

    it("records events for a resource with cleanup in finally", function* () {
      let stream = new InMemoryDurableStream();
      let cleanedUp = false;

      yield* durably(
        function* () {
          yield* resource(function* (provide) {
            try {
              yield* provide(42);
            } finally {
              cleanedUp = true;
            }
          });
        },
        { stream },
      );

      expect(cleanedUp).toEqual(true);
    });
  });

  describe("resource replay", () => {
    it("replays a simple resource without re-executing the init", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let value = yield* resource(function* (provide) {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "resource-setup");
            yield* provide(42);
          });
          return value;
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let setupExecuted = false;
      let result = yield* durably(
        function* () {
          let value = yield* resource(function* (provide) {
            yield* action<void>((resolve) => {
              setupExecuted = true;
              resolve();
              return () => {};
            }, "resource-setup");
            yield* provide(42);
          });
          return value;
        },
        { stream: replayStream },
      );

      expect(setupExecuted).toEqual(false);
      expect(result).toEqual(42);
    });

    it("replays a resource followed by other effects", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let conn = yield* resource<number>(function* (provide) {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "connect");
            yield* provide(10);
          });
          let extra = yield* action<number>((resolve) => {
            resolve(20);
            return () => {};
          }, "after-resource");
          return conn + extra;
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let connectExecuted = false;
      let afterResourceExecuted = false;
      let result = yield* durably(
        function* () {
          let conn = yield* resource<number>(function* (provide) {
            yield* action<void>((resolve) => {
              connectExecuted = true;
              resolve();
              return () => {};
            }, "connect");
            yield* provide(10);
          });
          let extra = yield* action<number>((resolve) => {
            afterResourceExecuted = true;
            resolve(20);
            return () => {};
          }, "after-resource");
          return conn + extra;
        },
        { stream: replayStream },
      );

      expect(connectExecuted).toEqual(false);
      expect(afterResourceExecuted).toEqual(false);
      expect(result).toEqual(30);
    });
  });

  describe("resource mid-workflow resume", () => {
    it("resumes after resource init replayed, continues with live effects", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let conn = yield* resource<number>(function* (provide) {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "connect");
            yield* provide(10);
          });
          let extra = yield* action<number>((resolve) => {
            resolve(20);
            return () => {};
          }, "after-resource");
          return conn + extra;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let cutIdx = events.findIndex(
        (e) =>
          e.type === "effect:yielded" && e.description === "after-resource",
      );
      expect(cutIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(events.slice(0, cutIdx));

      let connectExecuted = false;
      let afterResourceExecuted = false;
      let result = yield* durably(
        function* () {
          let conn = yield* resource<number>(function* (provide) {
            yield* action<void>((resolve) => {
              connectExecuted = true;
              resolve();
              return () => {};
            }, "connect");
            yield* provide(10);
          });
          let extra = yield* action<number>((resolve) => {
            afterResourceExecuted = true;
            resolve(20);
            return () => {};
          }, "after-resource");
          return conn + extra;
        },
        { stream: partialStream },
      );

      expect(connectExecuted).toEqual(false);
      expect(afterResourceExecuted).toEqual(true);
      expect(result).toEqual(30);
    });
  });
});

describe("durable ensure", () => {
  describe("ensure recording", () => {
    it("records events for ensure and runs cleanup", function* () {
      let stream = new InMemoryDurableStream();
      let cleanedUp = false;

      yield* durably(
        function* () {
          yield* ensure(() => {
            cleanedUp = true;
          });
          yield* sleep(1);
          return "done";
        },
        { stream },
      );

      expect(cleanedUp).toEqual(true);

      let events = allEvents(stream);
      expect(events.length).toBeGreaterThan(0);
    });

    it("ensure cleanup runs even during replay", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          yield* ensure(() => {
            // no-op during recording
          });
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "work");
          return "done";
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let cleanedUp = false;
      let result = yield* durably(
        function* () {
          yield* ensure(() => {
            cleanedUp = true;
          });
          yield* action<void>((resolve) => {
            resolve();
            return () => {};
          }, "work");
          return "done";
        },
        { stream: replayStream },
      );

      expect(cleanedUp).toEqual(true);
      expect(result).toEqual("done");
    });
  });

  describe("ensure with async cleanup", () => {
    it("records events for ensure with operation cleanup", function* () {
      let stream = new InMemoryDurableStream();
      let cleanedUp = false;

      yield* durably(
        function* () {
          yield* ensure(function* () {
            yield* sleep(1);
            cleanedUp = true;
          });
          yield* sleep(1);
          return "done";
        },
        { stream },
      );

      expect(cleanedUp).toEqual(true);
    });
  });
});

describe("durable resource + spawn", () => {
  it("records events for a spawned task that uses a resource", function* () {
    let stream = new InMemoryDurableStream();

    let result = yield* durably(
      function* () {
        let task = yield* spawn(function* () {
          let value = yield* resource(function* (provide) {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "child-resource-init");
            yield* provide(42);
          });
          return value;
        });
        return yield* task;
      },
      { stream },
    );

    expect(result).toEqual(42);
  });

  it("replays a spawned resource without re-executing", function* () {
    let recordStream = new InMemoryDurableStream();

    yield* durably(
      function* () {
        let task = yield* spawn(function* () {
          let value = yield* resource(function* (provide) {
            yield* action<void>((resolve) => {
              resolve();
              return () => {};
            }, "child-resource-init");
            yield* provide(42);
          });
          return value;
        });
        return yield* task;
      },
      { stream: recordStream },
    );

    let replayStream = InMemoryDurableStream.from(
      recordStream.read().map((e) => e.event),
    );

    let initExecuted = false;
    let result = yield* durably(
      function* () {
        let task = yield* spawn(function* () {
          let value = yield* resource(function* (provide) {
            yield* action<void>((resolve) => {
              initExecuted = true;
              resolve();
              return () => {};
            }, "child-resource-init");
            yield* provide(42);
          });
          return value;
        });
        return yield* task;
      },
      { stream: replayStream },
    );

    expect(initExecuted).toEqual(false);
    expect(result).toEqual(42);
  });
});
