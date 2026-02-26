import { describe, it } from "@effectionx/bdd";
import { action, sleep, until } from "effection";
import { expect } from "expect";
import { DivergenceError, InMemoryDurableStream, durable } from "./mod.ts";
import { allEvents, op, userEffectPairs } from "./test-helpers.ts";
import type { DurableEvent } from "./types.ts";

describe("replay", () => {
  describe("basic replay", () => {
    it("replays stored results without re-executing effects", function* () {
      let stream = new InMemoryDurableStream();
      let executionCount = 0;

      // First run: record
      yield* durable(
        op(function* () {
          executionCount++;
          let value = yield* action<number>((resolve) => {
            resolve(42);
            return () => {};
          });
          return value;
        }),
        { stream },
      );

      expect(executionCount).toEqual(1);

      // Second run with same stream: replay
      let stream2 = InMemoryDurableStream.from(
        stream.read().map((e) => e.event),
      );
      executionCount = 0;
      let actionEntered = false;

      let result = yield* durable(
        op(function* () {
          executionCount++;
          let value = yield* action<number>((resolve) => {
            actionEntered = true;
            resolve(99); // Different value — but replay should use stored 42
            return () => {};
          });
          return value;
        }),
        { stream: stream2 },
      );

      expect(executionCount).toEqual(1);
      // During replay, the stored value (42) should be returned
      expect(result).toEqual(42);
    });

    it("replays multi-step workflows", function* () {
      let stream = new InMemoryDurableStream();

      // First run
      let firstResult = yield* durable(
        op(function* () {
          let a = yield* until(Promise.resolve(10));
          let b = yield* until(Promise.resolve(20));
          return a + b;
        }),
        { stream },
      );

      expect(firstResult).toEqual(30);

      // Replay
      let stream2 = InMemoryDurableStream.from(
        stream.read().map((e) => e.event),
      );

      let replayResult = yield* durable(
        op(function* () {
          let a = yield* until(Promise.resolve(999));
          let b = yield* until(Promise.resolve(888));
          return a + b;
        }),
        { stream: stream2 },
      );

      // Should get original values, not new ones
      expect(replayResult).toEqual(30);
    });

    it("replays error results", function* () {
      let stream = new InMemoryDurableStream();

      // First run: error via action
      try {
        yield* durable(
          op(function* () {
            yield* action<never>((_, reject) => {
              reject(new Error("original-boom"));
              return () => {};
            });
          }),
          { stream },
        );
      } catch {
        // expected
      }

      // Replay — the action won't actually fire enter() during replay,
      // so no leaked rejections.
      let stream2 = InMemoryDurableStream.from(
        stream.read().map((e) => e.event),
      );

      try {
        yield* durable(
          op(function* () {
            yield* action<never>((_, reject) => {
              reject(new Error("different-boom"));
              return () => {};
            });
          }),
          { stream: stream2 },
        );
        expect(true).toEqual(false); // should not reach
      } catch (e) {
        expect((e as Error).message).toEqual("original-boom");
      }
    });
  });

  describe("partial replay", () => {
    it("runs live from cutoff when stream has incomplete events", function* () {
      let stream = new InMemoryDurableStream();

      // First run: 2-step workflow
      yield* durable(
        op(function* () {
          let a = yield* until(Promise.resolve(10));
          let b = yield* until(Promise.resolve(20));
          return a + b;
        }),
        { stream },
      );

      // Create a partial stream: only the first yield/next pair
      let events = stream.read().map((e) => e.event);
      let partialEvents: DurableEvent[] = [];
      let yieldNextCount = 0;
      for (let ev of events) {
        partialEvents.push(ev);
        if (ev.type === "next") {
          yieldNextCount++;
          if (yieldNextCount >= 1) break;
        }
      }

      let stream2 = InMemoryDurableStream.from(partialEvents);

      let result = yield* durable(
        op(function* () {
          let a = yield* until(Promise.resolve(10));
          let b = yield* until(Promise.resolve(77)); // Live value
          return a + b;
        }),
        { stream: stream2 },
      );

      // First value replayed (10), second runs live (77)
      expect(result).toEqual(87);
    });
  });

  describe("divergence detection", () => {
    it("throws DivergenceError on effect mismatch", function* () {
      let stream = new InMemoryDurableStream();

      // First run: sleep
      yield* durable(
        op(function* () {
          yield* sleep(1);
          return "done";
        }),
        { stream },
      );

      // Replay with different effect
      let stream2 = InMemoryDurableStream.from(
        stream.read().map((e) => e.event),
      );

      try {
        yield* durable(
          op(function* () {
            // Different effect at same position
            yield* until(Promise.resolve(42));
            return "done";
          }),
          { stream: stream2 },
        );
        expect(true).toEqual(false); // should not reach
      } catch (e) {
        expect(e).toBeInstanceOf(DivergenceError);
        if (e instanceof DivergenceError) {
          expect(e.expected).toEqual("sleep(1)");
        }
      }
    });
  });
});
