import { createChannel, sleep, spawn } from "effection";
import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { first } from "./first.ts";

describe("first", () => {
  it("should return the first value from the stream", function* () {
    const stream = createChannel<number, void>();

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.send(1);
      yield* stream.send(2);
      yield* stream.send(3);
      yield* stream.close();
    });

    const value = yield* first(stream);
    expect(value).toBe(1);
  });

  it("should throw if stream closes without yielding any values", function* () {
    const stream = createChannel<number, void>();

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.close();
    });

    let error: Error | undefined;
    try {
      yield* first(stream);
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

    const value = yield* first(stream);
    expect(value).toBe(undefined);
  });
});
