import { describe, it } from "jsr:@std/testing@^1/bdd";
import { expect } from "jsr:@std/expect@^1";
import { run, spawn, createSignal, each, sleep } from "effection";
import { debounce } from "./debounce.ts";

describe("debounce", () => {
  it("ignores messages within the debounce period", async () => {
    await run(function* () {
      const signal = createSignal<number>();
      const debouncedStream = debounce(10);

      const updates: number[] = [];

      yield* spawn(function* () {
        for (const update of yield* each(debouncedStream(signal))) {
          updates.push(update);
          yield* each.next();
        }
      });

      signal.send(1);
      yield* sleep(1);
      signal.send(2);
      yield* sleep(1);
      signal.send(3);

      yield* sleep(10);

      expect(updates).toEqual([3]);
    });
  });
});