import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { action, all, race, sleep } from "effection";
import { durably, InMemoryDurableStream } from "./mod.ts";
import { allEvents } from "./test-helpers.ts";

describe("durable all", () => {
  describe("recording", () => {
    it("records events for all() with multiple operations", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          return yield* all([
            action<number>((resolve) => {
              resolve(1);
              return () => {};
            }, "task-a"),
            action<number>((resolve) => {
              resolve(2);
              return () => {};
            }, "task-b"),
          ]);
        },
        { stream },
      );

      expect(result).toEqual([1, 2]);

      let events = allEvents(stream);
      let taskA = events.find(
        (e) => e.type === "effect:yielded" && e.description === "task-a",
      );
      let taskB = events.find(
        (e) => e.type === "effect:yielded" && e.description === "task-b",
      );
      expect(taskA).toBeDefined();
      expect(taskB).toBeDefined();
    });

    it("records events for all() with sleep operations", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          yield* all([sleep(1), sleep(1)]);
          return "done";
        },
        { stream },
      );

      expect(result).toEqual("done");
    });
  });

  describe("replay", () => {
    it("replays all() without re-executing child effects", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          return yield* all([
            action<number>((resolve) => {
              resolve(10);
              return () => {};
            }, "task-a"),
            action<number>((resolve) => {
              resolve(20);
              return () => {};
            }, "task-b"),
          ]);
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let aExecuted = false;
      let bExecuted = false;
      let result = yield* durably(
        function* () {
          return yield* all([
            action<number>((resolve) => {
              aExecuted = true;
              resolve(100);
              return () => {};
            }, "task-a"),
            action<number>((resolve) => {
              bExecuted = true;
              resolve(200);
              return () => {};
            }, "task-b"),
          ]);
        },
        { stream: replayStream },
      );

      expect(aExecuted).toEqual(false);
      expect(bExecuted).toEqual(false);
      expect(result).toEqual([10, 20]);
    });
  });

  describe("mid-workflow resume", () => {
    it("resumes after all() with subsequent live effects", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let [a, b] = yield* all([
            action<number>((resolve) => {
              resolve(10);
              return () => {};
            }, "task-a"),
            action<number>((resolve) => {
              resolve(20);
              return () => {};
            }, "task-b"),
          ]);
          let extra = yield* action<number>((resolve) => {
            resolve(30);
            return () => {};
          }, "after-all");
          return a + b + extra;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let cutIdx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "after-all",
      );
      expect(cutIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(events.slice(0, cutIdx));

      let afterAllExecuted = false;
      let result = yield* durably(
        function* () {
          let [a, b] = yield* all([
            action<number>((resolve) => {
              resolve(10);
              return () => {};
            }, "task-a"),
            action<number>((resolve) => {
              resolve(20);
              return () => {};
            }, "task-b"),
          ]);
          let extra = yield* action<number>((resolve) => {
            afterAllExecuted = true;
            resolve(30);
            return () => {};
          }, "after-all");
          return a + b + extra;
        },
        { stream: partialStream },
      );

      expect(afterAllExecuted).toEqual(true);
      expect(result).toEqual(60);
    });
  });
});

describe("durable race", () => {
  describe("recording", () => {
    it("records events for race() and returns the winner", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          return yield* race([
            action<string>((resolve) => {
              resolve("fast");
              return () => {};
            }, "racer-fast"),
            action<string>((_resolve) => {
              return () => {};
            }, "racer-slow"),
          ]);
        },
        { stream },
      );

      expect(result).toEqual("fast");

      let events = allEvents(stream);
      let racerFast = events.find(
        (e) => e.type === "effect:yielded" && e.description === "racer-fast",
      );
      expect(racerFast).toBeDefined();
    });

    it("records events for race() with sleep operations", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durably(
        function* () {
          return yield* race([
            (function* () {
              yield* sleep(1);
              return "a";
            })(),
            (function* () {
              yield* sleep(100);
              return "b";
            })(),
          ]);
        },
        { stream },
      );

      expect(result).toEqual("a");
    });
  });

  describe("replay", () => {
    it("replays race() without re-executing effects", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          return yield* race([
            action<string>((resolve) => {
              resolve("winner");
              return () => {};
            }, "racer-fast"),
            action<string>((_resolve) => {
              return () => {};
            }, "racer-slow"),
          ]);
        },
        { stream: recordStream },
      );

      let replayStream = InMemoryDurableStream.from(
        recordStream.read().map((e) => e.event),
      );

      let fastExecuted = false;
      let result = yield* durably(
        function* () {
          return yield* race([
            action<string>((resolve) => {
              fastExecuted = true;
              resolve("winner");
              return () => {};
            }, "racer-fast"),
            action<string>((_resolve) => {
              return () => {};
            }, "racer-slow"),
          ]);
        },
        { stream: replayStream },
      );

      expect(fastExecuted).toEqual(false);
      expect(result).toEqual("winner");
    });
  });

  describe("mid-workflow resume", () => {
    it("resumes after race() with subsequent live effects", function* () {
      let recordStream = new InMemoryDurableStream();

      yield* durably(
        function* () {
          let winner = yield* race([
            action<string>((resolve) => {
              resolve("fast");
              return () => {};
            }, "racer-fast"),
            action<string>((_resolve) => {
              return () => {};
            }, "racer-slow"),
          ]);
          let extra = yield* action<string>((resolve) => {
            resolve(" world");
            return () => {};
          }, "after-race");
          return winner + extra;
        },
        { stream: recordStream },
      );

      let events = recordStream.read().map((e) => e.event);
      let cutIdx = events.findIndex(
        (e) => e.type === "effect:yielded" && e.description === "after-race",
      );
      expect(cutIdx).toBeGreaterThan(0);

      let partialStream = InMemoryDurableStream.from(events.slice(0, cutIdx));

      let afterRaceExecuted = false;
      let result = yield* durably(
        function* () {
          let winner = yield* race([
            action<string>((resolve) => {
              resolve("fast");
              return () => {};
            }, "racer-fast"),
            action<string>((_resolve) => {
              return () => {};
            }, "racer-slow"),
          ]);
          let extra = yield* action<string>((resolve) => {
            afterRaceExecuted = true;
            resolve(" world");
            return () => {};
          }, "after-race");
          return winner + extra;
        },
        { stream: partialStream },
      );

      expect(afterRaceExecuted).toEqual(true);
      expect(result).toEqual("fast world");
    });
  });
});

describe("durable all + race combined", () => {
  it("records and replays nested all inside race", function* () {
    let recordStream = new InMemoryDurableStream();

    yield* durably(
      function* () {
        return yield* race([
          all([
            action<number>((resolve) => {
              resolve(1);
              return () => {};
            }, "group-a-1"),
            action<number>((resolve) => {
              resolve(2);
              return () => {};
            }, "group-a-2"),
          ]),
          all([
            action<number>((_resolve) => {
              return () => {};
            }, "group-b-1"),
            action<number>((_resolve) => {
              return () => {};
            }, "group-b-2"),
          ]),
        ]);
      },
      { stream: recordStream },
    );

    let replayStream = InMemoryDurableStream.from(
      recordStream.read().map((e) => e.event),
    );

    let groupAExecuted = false;
    let result = yield* durably(
      function* () {
        return yield* race([
          all([
            action<number>((resolve) => {
              groupAExecuted = true;
              resolve(1);
              return () => {};
            }, "group-a-1"),
            action<number>((resolve) => {
              resolve(2);
              return () => {};
            }, "group-a-2"),
          ]),
          all([
            action<number>((_resolve) => {
              return () => {};
            }, "group-b-1"),
            action<number>((_resolve) => {
              return () => {};
            }, "group-b-2"),
          ]),
        ]);
      },
      { stream: replayStream },
    );

    expect(groupAExecuted).toEqual(false);
    expect(result).toEqual([1, 2]);
  });
});
