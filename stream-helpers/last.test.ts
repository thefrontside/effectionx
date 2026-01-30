import { createChannel, sleep, spawn } from "effection";
import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { last } from "./last.ts";

describe("last", () => {
  it("should return the last value from the stream", function* () {
    const stream = createChannel<number, void>();

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.send(1);
      yield* stream.send(2);
      yield* stream.send(3);
      yield* stream.close();
    });

    const value = yield* last(stream);
    expect(value).toBe(3);
  });

  it("should return the only value when stream has one item", function* () {
    const stream = createChannel<number, void>();

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.send(42);
      yield* stream.close();
    });

    const value = yield* last(stream);
    expect(value).toBe(42);
  });

  it("should throw if stream closes without yielding any values", function* () {
    const stream = createChannel<number, void>();

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.close();
    });

    let error: Error | undefined;
    try {
      yield* last(stream);
    } catch (e) {
      error = e as Error;
    }

    expect(error).toBeDefined();
    expect(error?.message).toBe("Stream closed without yielding any values");
  });

  it("should work with undefined as a valid value", function* () {
    const stream = createChannel<undefined, void>();

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.send(undefined);
      yield* stream.close();
    });

    const value = yield* last(stream);
    expect(value).toBe(undefined);
  });
});
