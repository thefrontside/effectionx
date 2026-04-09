import {
  createChannel,
  each,
  race,
  sleep,
  spawn,
  withResolvers,
} from "effection";
import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { createValueSignal } from "./value.ts";

describe("value", () => {
  it("takes an initial value", function* () {
    const signal = yield* createValueSignal(true);

    expect(signal.valueOf()).toEqual(true);
  });
  describe("set", () => {
    it("allows to set a new value", function* () {
      const signal = yield* createValueSignal(true);

      signal.set(false);

      expect(signal.valueOf()).toEqual(false);
    });
    it("does not send a value to the stream when the set value is the same as the current value", function* () {
      expect.assertions(2);
      const signal = yield* createValueSignal(true);

      const { resolve, operation } = withResolvers<void>();

      const updates = createChannel<boolean>();
      const subscription = yield* updates;

      yield* spawn(function* () {
        for (const update of yield* each(signal)) {
          yield* updates.send(update);
          yield* each.next();
        }
      });

      yield* spawn(function* () {
        signal.set(true);

        let next = yield* race([
          subscription.next(),
          (function* () {
            yield* sleep(1);
            return "sleep won; update not received";
          })(),
        ]);

        expect(next).toEqual("sleep won; update not received");

        signal.set(false);

        next = yield* subscription.next();

        expect(next.value).toEqual(false);
        resolve();
      });

      yield* operation;
    });
  });
  describe("update", () => {
    it("updates the value of the signal", function* () {
      const signal = yield* createValueSignal(true);

      signal.update((value) => !value);

      expect(signal.valueOf()).toEqual(false);
    });
  });
});
