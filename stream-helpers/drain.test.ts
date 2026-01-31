import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { drain } from "./drain.ts";
import { streamOf } from "./stream-of.ts";

describe("drain", () => {
  it("should return the close value after exhausting the stream", function* () {
    const stream = streamOf(
      (function* () {
        yield 1;
        yield 2;
        yield 3;
        return "done";
      })(),
    );

    const closeValue = yield* drain(stream);
    expect(closeValue).toBe("done");
  });

  it("should return the close value when stream has no items", function* () {
    const stream = streamOf(
      (function* () {
        return "empty";
      })(),
    );

    const closeValue = yield* drain(stream);
    expect(closeValue).toBe("empty");
  });

  it("should exhaust all values before returning close value", function* () {
    let itemsYielded = 0;

    const stream = streamOf(
      (function* () {
        for (let i = 0; i < 100; i++) {
          yield i;
          itemsYielded++;
        }
        return "all-sent";
      })(),
    );

    const closeValue = yield* drain(stream);

    // drain should have consumed all items before getting close value
    expect(itemsYielded).toBe(100);
    expect(closeValue).toBe("all-sent");
  });
});
