import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { last } from "./last.ts";
import { streamOf } from "./stream-of.ts";

describe("last", () => {
  it("should return the last value from the stream", function* () {
    const stream = streamOf([1, 2, 3]);
    const value = yield* last(stream);
    expect(value).toBe(3);
  });

  it("should return the only value when stream has one item", function* () {
    const stream = streamOf([42]);
    const value = yield* last(stream);
    expect(value).toBe(42);
  });

  it("should return undefined if stream closes without yielding any values", function* () {
    const stream = streamOf([]);
    const value = yield* last(stream);
    expect(value).toBe(undefined);
  });

  it("should work with undefined as a valid value", function* () {
    const stream = streamOf([1, 2, undefined]);
    const value = yield* last(stream);
    expect(value).toBe(undefined);
  });

  describe("expect", () => {
    it("should return the last value from the stream", function* () {
      const stream = streamOf([1, 2, 3]);
      const value = yield* last.expect(stream);
      expect(value).toBe(3);
    });

    it("should return the only value when stream has one item", function* () {
      const stream = streamOf([42]);
      const value = yield* last.expect(stream);
      expect(value).toBe(42);
    });

    it("should throw if stream closes without yielding any values", function* () {
      const stream = streamOf([]);

      let error: Error | undefined;
      try {
        yield* last.expect(stream);
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toBe("Stream closed without yielding any values");
    });

    it("should work with undefined as a valid value", function* () {
      const stream = streamOf([1, 2, undefined]);
      const value = yield* last.expect(stream);
      expect(value).toBe(undefined);
    });
  });
});
