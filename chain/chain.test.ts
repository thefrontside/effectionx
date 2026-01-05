import { describe, it } from "@effectionx/bdd";
import { expect } from "@std/expect";
import type { Operation } from "effection";

import { Chain } from "./mod.ts";

describe("chain", () => {
  it("can continunue", function* () {
    let result = yield* new Chain<string>((resolve) => {
      resolve("Hello");
    }).then(function* (message) {
      return `${message} World!`;
    });
    expect(result).toEqual("Hello World!");
  });
  it("can catch", function* () {
    let result = yield* new Chain<string>((_, reject) => {
      reject(new Error("boom!"));
    }).catch(function* (e) {
      return (e as Error).message;
    });

    expect(result).toEqual("boom!");
  });

  it("can have a finally", function* () {
    let didExecuteFinally = false;
    expect.assertions(1);
    try {
      yield* new Chain<string>((_, reject) => {
        reject(new Error("boom!"));
      }).finally(function* () {
        didExecuteFinally = true;
      });
      throw new Error(`expected chain to reject`);
    } catch (_) {
      expect(didExecuteFinally).toEqual(true);
    }
  });

  it("can chain off of an existing operation", function* () {
    function* twice(num: number): Operation<number> {
      return num * 2;
    }

    let chain = Chain.from(twice(5)).then(function* (num) {
      return num * 2;
    });

    expect(yield* chain).toEqual(20);

    // make sure it works twice
    expect(yield* chain).toEqual(20);
  });
});
