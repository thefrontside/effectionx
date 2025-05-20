import { run } from "effection";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { number } from "./number.ts";

describe("number", () => {
  it("initializes to 0 without a default", async () => {
    await run(function* () {
      const n = yield* number();

      expect(n.value).toBe(0);
    });
  });

  it("increments the value", async () => {
    await run(function* () {
      const n = yield* number(42);
      const subscription = yield* n;

      expect(yield* n.increment()).toBe(43);

      expect((yield* subscription.next()).value).toBe(43);
    });
  });

  it("decrements the value", async () => {
    await run(function* () {
      const n = yield* number(42);
      const subscription = yield* n;

      expect(yield* n.decrement()).toBe(41);

      expect((yield* subscription.next()).value).toBe(41);
    });
  });

  it("sets the value", async () => {
    await run(function* () {
      const n = yield* number(42);
      const subscription = yield* n;

      expect(yield* n.set(100)).toBe(100);

      expect((yield* subscription.next()).value).toBe(100);
    });
  });
});
