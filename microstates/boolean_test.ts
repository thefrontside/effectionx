import { run } from "effection";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { boolean } from "./boolean.ts";

describe("boolean", () => {
  describe("creation", () => {
    it("initializes with a default value", async () => {
      await run(function* () {
        const bool = yield* boolean();
        expect(bool.value).toBe(false);
      });
    });
    it("initializes with provided value", async () => {
      await run(function* () {
        const bool = yield* boolean(true);
        expect(bool.value).toBe(true);
      });
    });
  });
  describe("toggle", () => {
    it("changes the value", async () => {
      await run(function* () {
        const bool = yield* boolean(true);
        expect(yield* bool.toggle()).toBe(false);
        expect(bool.value).toBe(false);
      });
    });
    it("pushes updates through the stream", async () => {
      await run(function* () {
        const bool = yield* boolean(true);
        const subscription = yield* bool;
        yield* bool.toggle();
        expect((yield* subscription.next()).value).toBe(false);
        yield* bool.toggle();
        expect((yield* subscription.next()).value).toBe(true);
      });
    });
  });
  describe("set", () => {
    it("updates the value", async () => {
      await run(function* () {
        const bool = yield* boolean(true);
        const subscription = yield* bool;
        yield* bool.set(false);
        expect((yield* subscription.next()).value).toBe(false);
      });
    });
  });
});
