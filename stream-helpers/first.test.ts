import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { first } from "./first.ts";
import { streamOf } from "./stream-of.ts";

describe("first", () => {
  it("should return the first value from the stream", function* () {
    const stream = streamOf([1, 2, 3]);
    const value = yield* first(stream);
    expect(value).toBe(1);
  });

  it("should return undefined if stream closes without yielding any values", function* () {
    const stream = streamOf([]);
    const value = yield* first(stream);
    expect(value).toBe(undefined);
  });

  it("should work with undefined as a valid value", function* () {
    const stream = streamOf([undefined, 1, 2]);
    const value = yield* first(stream);
    expect(value).toBe(undefined);
  });

  describe("expect", () => {
    it("should return the first value from the stream", function* () {
      const stream = streamOf([1, 2, 3]);
      const value = yield* first.expect(stream);
      expect(value).toBe(1);
    });

    it("should throw if stream closes without yielding any values", function* () {
      const stream = streamOf([]);

      let error: Error | undefined;
      try {
        yield* first.expect(stream);
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toBe("Stream closed without yielding any values");
    });

    it("should work with undefined as a valid value", function* () {
      const stream = streamOf([undefined, 1, 2]);
      const value = yield* first.expect(stream);
      expect(value).toBe(undefined);
    });
  });
});
