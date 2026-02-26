import { describe, it } from "@effectionx/bdd";
import { all, call, race, sleep, spawn, suspend } from "effection";
import { expect } from "expect";
import { InMemoryDurableStream, durable } from "./mod.ts";
import { allEvents, op } from "./test-helpers.ts";

describe("structured concurrency", () => {
  describe("spawn", () => {
    it("records spawn and close for child coroutine", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          let task = yield* spawn(function* () {
            yield* sleep(1);
            return 42;
          });
          return yield* task;
        }),
        { stream },
      );

      // Allow structured teardown to complete
      yield* sleep(0);

      let events = allEvents(stream);
      let spawns = events.filter((e) => e.type === "spawn");
      let closes = events.filter((e) => e.type === "close");

      expect(spawns.length).toBeGreaterThanOrEqual(1);
      expect(closes.length).toBeGreaterThanOrEqual(1);

      // Find the user-level spawn (root → child)
      let rootSpawns = spawns.filter(
        (e) => e.type === "spawn" && e.coroutineId === "root",
      );
      expect(rootSpawns.length).toBeGreaterThanOrEqual(1);
    });

    it("records close when child is halted by parent completing", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          yield* spawn(function* () {
            yield* suspend();
          });
          return "done";
        }),
        { stream },
      );

      yield* sleep(0);

      let events = allEvents(stream);
      let closes = events.filter((e) => e.type === "close");
      expect(closes.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe("all", () => {
    it("records events for all branches", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durable(
        op(function* () {
          return yield* all([
            call(function* () {
              yield* sleep(1);
              return 10;
            }),
            call(function* () {
              yield* sleep(1);
              return 20;
            }),
          ]);
        }),
        { stream },
      );

      expect(result).toEqual([10, 20]);

      yield* sleep(0);

      let events = allEvents(stream);
      // The all() implementation spawns branches internally
      let spawns = events.filter((e) => e.type === "spawn");
      expect(spawns.length).toBeGreaterThanOrEqual(2);
    });

    it("records close events for all branches", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          return yield* all([
            call(function* () {
              yield* sleep(1);
              return "a";
            }),
            call(function* () {
              yield* sleep(2);
              return "b";
            }),
          ]);
        }),
        { stream },
      );

      yield* sleep(0);

      let events = allEvents(stream);
      let closes = events.filter((e) => e.type === "close");
      expect(closes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("race", () => {
    it("returns the winner's value", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durable(
        op(function* () {
          return yield* race([
            call(function* () {
              yield* sleep(1);
              return "fast";
            }),
            call(function* () {
              yield* sleep(100);
              return "slow";
            }),
          ]);
        }),
        { stream },
      );

      expect(result).toEqual("fast");
    });

    it("records close events for race participants", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          return yield* race([
            call(function* () {
              yield* sleep(1);
              return "fast";
            }),
            call(function* () {
              yield* sleep(100);
              return "slow";
            }),
          ]);
        }),
        { stream },
      );

      yield* sleep(0);

      let events = allEvents(stream);
      let closes = events.filter((e) => e.type === "close");
      expect(closes.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe("nested scopes", () => {
    it("records spawn/close for nested scope hierarchy", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          let task = yield* spawn(function* () {
            let inner = yield* spawn(function* () {
              yield* sleep(1);
              return "inner";
            });
            return yield* inner;
          });
          return yield* task;
        }),
        { stream },
      );

      yield* sleep(0);

      let events = allEvents(stream);
      let spawns = events.filter((e) => e.type === "spawn");
      let closes = events.filter((e) => e.type === "close");

      // At least 2 spawns (root→child, child→grandchild)
      expect(spawns.length).toBeGreaterThanOrEqual(2);
      // At least 2 closes (grandchild + child; root may or may not)
      expect(closes.length).toBeGreaterThanOrEqual(2);
    });
  });
});
