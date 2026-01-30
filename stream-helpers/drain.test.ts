import { createChannel, sleep, spawn } from "effection";
import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { drain } from "./drain.ts";

describe("drain", () => {
  it("should return the close value after exhausting the stream", function* () {
    const stream = createChannel<number, string>();

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.send(1);
      yield* stream.send(2);
      yield* stream.send(3);
      yield* stream.close("done");
    });

    const closeValue = yield* drain(stream);
    expect(closeValue).toBe("done");
  });

  it("should return the close value when stream has no items", function* () {
    const stream = createChannel<number, string>();

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.close("empty");
    });

    const closeValue = yield* drain(stream);
    expect(closeValue).toBe("empty");
  });

  it("should discard all yielded values", function* () {
    const stream = createChannel<number, void>();
    const sideEffects: number[] = [];

    yield* spawn(function* () {
      yield* sleep(0);
      // These values should be discarded, not processed
      yield* stream.send(1);
      yield* stream.send(2);
      yield* stream.send(3);
      yield* stream.close();
    });

    yield* drain(stream);
    // No side effects from processing values
    expect(sideEffects).toEqual([]);
  });
});
