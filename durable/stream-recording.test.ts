import { describe, it } from "@effectionx/bdd";
import { action, sleep, spawn, until } from "effection";
import { expect } from "expect";
import { InMemoryDurableStream, durable } from "./mod.ts";
import {
  allEvents,
  op,
  userEffectPairs,
  userFacingEvents,
} from "./test-helpers.ts";

describe("stream recording", () => {
  describe("close events", () => {
    it("records close(ok) for root on a pure return", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          return "hello";
        }),
        { stream },
      );

      let events = allEvents(stream);
      let closes = events.filter((e) => e.type === "close");
      expect(closes.length).toBeGreaterThanOrEqual(1);

      let rootClose = closes.find(
        (e) => e.type === "close" && e.coroutineId === "root",
      );
      expect(rootClose).toBeDefined();
      if (rootClose && rootClose.type === "close") {
        expect(rootClose.status).toEqual("ok");
      }
    });

    it("records close(err) when workflow throws", function* () {
      let stream = new InMemoryDurableStream();

      try {
        yield* durable(
          op(function* () {
            throw new Error("boom");
          }),
          { stream },
        );
      } catch {
        // expected
      }

      let events = allEvents(stream);
      let rootClose = events.find(
        (e) => e.type === "close" && e.coroutineId === "root",
      );
      expect(rootClose).toBeDefined();
      if (rootClose && rootClose.type === "close") {
        expect(rootClose.status).toEqual("err");
        expect(rootClose.error?.message).toEqual("boom");
      }
    });
  });

  describe("yield/next recording", () => {
    it("records no user effects for a pure return", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          return "hello";
        }),
        { stream },
      );

      let userEffects = userFacingEvents(stream).filter(
        (e) => e.type === "yield" || e.type === "next",
      );
      expect(userEffects.length).toEqual(0);
    });

    it("records yield/next pairs for action effects", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          let value = yield* action<number>((resolve) => {
            resolve(42);
            return () => {};
          });
          return value;
        }),
        { stream },
      );

      let pairs = userEffectPairs(stream);
      expect(pairs.length).toEqual(1);

      let [yielded, resolved] = pairs[0];
      expect(yielded.type).toEqual("yield");
      if (yielded.type === "yield") {
        expect(yielded.description).toEqual("action");
      }
      expect(resolved.type).toEqual("next");
      if (resolved.type === "next") {
        expect(resolved.status).toEqual("ok");
        expect(resolved.value).toEqual(42);
      }
    });

    it("records yield/next pairs for multi-step workflows", function* () {
      let stream = new InMemoryDurableStream();

      let result = yield* durable(
        op(function* () {
          let a = yield* until(Promise.resolve(10));
          let b = yield* until(Promise.resolve(20));
          return a + b;
        }),
        { stream },
      );

      expect(result).toEqual(30);

      let pairs = userEffectPairs(stream);
      expect(pairs.length).toEqual(2);

      if (pairs[0][1].type === "next") {
        expect(pairs[0][1].value).toEqual(10);
      }
      if (pairs[1][1].type === "next") {
        expect(pairs[1][1].value).toEqual(20);
      }
    });

    it("records next(err) when an effect fails", function* () {
      let stream = new InMemoryDurableStream();

      try {
        yield* durable(
          op(function* () {
            yield* until(Promise.reject(new Error("boom")));
          }),
          { stream },
        );
      } catch {
        // expected
      }

      let pairs = userEffectPairs(stream);
      expect(pairs.length).toEqual(1);

      let [yielded, errored] = pairs[0];
      expect(yielded.type).toEqual("yield");
      expect(errored.type).toEqual("next");
      if (errored.type === "next") {
        expect(errored.status).toEqual("err");
        expect(errored.error?.message).toEqual("boom");
      }
    });

    it("records yield/next for sleep effects", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          yield* sleep(1);
          return "done";
        }),
        { stream },
      );

      let pairs = userEffectPairs(stream);
      expect(pairs.length).toEqual(1);

      let [yielded] = pairs[0];
      if (yielded.type === "yield") {
        expect(yielded.description).toEqual("sleep(1)");
      }
    });
  });

  describe("spawn events", () => {
    it("records spawn event for spawned tasks", function* () {
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

      let events = allEvents(stream);
      let spawns = events.filter((e) => e.type === "spawn");
      expect(spawns.length).toBeGreaterThanOrEqual(1);
    });

    it("records spawn before child yield events", function* () {
      let stream = new InMemoryDurableStream();

      yield* durable(
        op(function* () {
          let task = yield* spawn(function* () {
            yield* sleep(1);
            return 1;
          });
          return yield* task;
        }),
        { stream },
      );

      let events = allEvents(stream);
      let firstSpawn = events.findIndex((e) => e.type === "spawn");
      expect(firstSpawn).toBeGreaterThanOrEqual(0);

      let spawnEvent = events[firstSpawn];
      if (spawnEvent.type === "spawn") {
        let childId = spawnEvent.childCoroutineId;
        let firstChildYield = events.findIndex(
          (e) => e.type === "yield" && e.coroutineId === childId,
        );
        if (firstChildYield >= 0) {
          expect(firstSpawn).toBeLessThan(firstChildYield);
        }
      }
    });
  });
});
