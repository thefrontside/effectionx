import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import { call } from "effection";

describe("call()", () => {
  it("should call the generator function", function* () {
    expect.assertions(1);
    function* me() {
      return "valid";
    }
    const result = yield* call(me);
    expect(result).toBe("valid");
  });

  it("should return an Err()", function* () {
    expect.assertions(1);
    const err = new Error("bang!");
    function* me() {
      throw err;
    }
    try {
      yield* call(me);
    } catch (err) {
      expect(err).toEqual(err);
    }
  });

  it("should call a promise", function* () {
    expect.assertions(1);
    const me = () =>
      new Promise<string>((resolve) => {
        setTimeout(() => {
          resolve("valid");
        }, 10);
      });
    const result = yield* call(me);
    expect(result).toEqual("valid");
  });
});
