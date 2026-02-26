import { describe, it } from "@effectionx/bdd";
import { resource, sleep } from "effection";
import { expect } from "expect";
import { InMemoryDurableStream, durable } from "./mod.ts";
import { allEvents, op } from "./test-helpers.ts";

describe("durable resource", () => {
  it("records resource acquire/release lifecycle", function* () {
    let stream = new InMemoryDurableStream();
    let acquired = false;
    let released = false;

    yield* durable(
      op(function* () {
        let value = yield* resource<number>(function* (provide) {
          acquired = true;
          try {
            yield* provide(42);
          } finally {
            released = true;
          }
        });
        return value;
      }),
      { stream },
    );

    yield* sleep(0);

    expect(acquired).toEqual(true);
    expect(released).toEqual(true);

    let events = allEvents(stream);
    // Should have close events from resource teardown
    let closes = events.filter((e) => e.type === "close");
    expect(closes.length).toBeGreaterThanOrEqual(1);
  });

  it("records resource value correctly", function* () {
    let stream = new InMemoryDurableStream();

    let result = yield* durable(
      op(function* () {
        let value = yield* resource<string>(function* (provide) {
          yield* provide("resource-value");
        });
        return value;
      }),
      { stream },
    );

    expect(result).toEqual("resource-value");
  });

  it("records events when resource throws during acquire", function* () {
    let stream = new InMemoryDurableStream();

    try {
      yield* durable(
        op(function* () {
          yield* resource<never>(function* () {
            throw new Error("acquire-failed");
          });
        }),
        { stream },
      );
    } catch (e) {
      expect((e as Error).message).toEqual("acquire-failed");
    }

    yield* sleep(0);

    let events = allEvents(stream);
    let closes = events.filter((e) => e.type === "close");
    expect(closes.length).toBeGreaterThanOrEqual(1);

    // At least one close should indicate error
    let errorCloses = closes.filter(
      (e) => e.type === "close" && e.status === "err",
    );
    expect(errorCloses.length).toBeGreaterThanOrEqual(1);
  });
});
