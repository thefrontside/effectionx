import { createSignal, spawn } from "effection";
import { describe, it } from "@effectionx/deno-testing-bdd";
import { expect } from "@std/expect";

import { forEach } from "./for-each.ts";

describe("forEach", () => {
  it("should invoke function for each item in the stream", function* () {
    const stream = createSignal<number, void>();
    const processedItems: number[] = [];

    yield* spawn(() =>
      forEach(function* (item: number) {
        processedItems.push(item);
      }, stream)
    );

    stream.send(1);
    stream.send(2);
    stream.send(3);

    expect(processedItems).toEqual([1, 2, 3]);
  });

  it("should return the close value of the stream", function* () {
    const stream = createSignal<string, number>();

    const result = yield* spawn(() =>
      forEach(function* () {
        // Just process the item
      }, stream)
    );

    stream.send("hello");
    stream.send("world");
    stream.close(42); // Close with value 42

    const closeValue = yield* result;
    expect(closeValue).toBe(42);
  });
});
