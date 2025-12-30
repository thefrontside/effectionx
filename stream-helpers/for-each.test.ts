import { createChannel, sleep, spawn } from "effection";
import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";

import { forEach } from "./for-each.ts";

describe("forEach", () => {
  it("should invoke function for each item in the stream", function* () {
    expect.assertions(1);

    const stream = createChannel<number, void>();
    const processedItems: number[] = [];

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.send(1);
      yield* stream.send(2);
      yield* stream.send(3);
      yield* stream.close();
    });

    yield* forEach(function* (item: number) {
      processedItems.push(item);
    }, stream);

    expect(processedItems).toEqual([1, 2, 3]);
  });

  it("should return the close value of the stream", function* () {
    const stream = createChannel<string, number>();

    yield* spawn(function* () {
      yield* sleep(0);
      yield* stream.send("hello");
      yield* stream.send("world");
      yield* stream.close(42); // Close with value 42
    });

    const closeValue = yield* forEach(function* () {}, stream);
    expect(closeValue).toBe(42);
  });
});
