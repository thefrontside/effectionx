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

  it("should exhaust all values before returning close value", function* () {
    const stream = createChannel<number, string>();
    let itemsSent = 0;

    yield* spawn(function* () {
      yield* sleep(0);
      for (let i = 0; i < 100; i++) {
        yield* stream.send(i);
        itemsSent++;
      }
      yield* stream.close("all-sent");
    });

    const closeValue = yield* drain(stream);

    // drain should have consumed all items before getting close value
    expect(itemsSent).toBe(100);
    expect(closeValue).toBe("all-sent");
  });
});
