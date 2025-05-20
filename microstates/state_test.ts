import { run } from "effection";
import { describe, it } from "@std/testing/bdd";
import { expect } from "@std/expect";
import { boolean } from "./boolean.ts";
import { state } from "./state.ts";
import { number } from "./number.ts";

describe("state", () => {
  it("initializes provided values", async () => {
    await run(function* () {
      const s = yield* state({
        isOpen: boolean(),
        width: number(),
      }, { isOpen: true, width: 100 });

      expect(s).toMatchObject({
        isOpen: {
          value: true,
        },
        width: {
          value: 100,
        },
      });
    });
  });
  it("streams composed value", async () => {
    await run(function* () {
      const s = yield* state({
        isOpen: boolean(false),
        width: number(),
      });

      const subscription = yield* s;

      expect(yield* s.isOpen.toggle()).toBe(true);

      let next = yield* subscription.next();

      expect(next.value).toMatchObject({
        isOpen: true,
        width: 0,
      });

      expect(yield* s.width.increment()).toBe(1);

      next = yield* subscription.next();

      expect(next.value).toMatchObject({
        isOpen: true,
        width: 1,
      });
    });
  });
  it("has a value", async () => {
    await run(function* () {
      const s = yield* state({
        isOpen: boolean(false),
        isFlying: boolean(true),
      });

      const subscription = yield* s;

      expect(yield* s.isOpen.toggle()).toBe(true);

      let next = yield* subscription.next();
      expect(next.value).toEqual({
        isOpen: true,
        isFlying: true,
      });
    });
  });
  it("updates both leaf and root", async () => {
    await run(function* () {
      const s = yield* state({
        isOpen: boolean(),
        isFlying: boolean(),
      });

      const isOpenSubscription = yield* s.isOpen;
      const stateSubscription = yield* s;

      expect(yield* s.isOpen.toggle()).toBe(true);

      expect((yield* stateSubscription.next()).value).toEqual({
        isOpen: true,
        isFlying: false,
      });
      expect((yield* isOpenSubscription.next()).value).toEqual(true);
    });
  });
  describe("nested states", () => {
    const states = state({
      car: state({
        isOn: boolean(true),
      }),
      person: state({
        isSleeping: boolean(),
      }),
    });
    it("allows initializing deeply nested types", async () => {
      await run(function* () {
        const s = yield* states;

        const subscription = yield* s;

        expect(yield* s.person.isSleeping.toggle()).toBe(true);

        expect((yield* subscription.next()).value).toEqual({
          car: {
            isOn: true,
          },
          person: {
            isSleeping: true,
          },
        });
      });
    });
  });
});
