import { createContext } from "effection";
import { expect } from "vitest";
import { beforeAll, beforeEach, describe, it } from "../../mod.ts";

let Log = createContext<string[]>("test-log");

describe("scope isolation", () => {
  beforeAll(function* () {
    yield* Log.set([]);
  });

  beforeEach(function* () {
    let log = yield* Log.expect();
    log.length = 0;
    log.push("outer-each");
  });

  it("runs outer beforeEach", function* () {
    let log = yield* Log.expect();
    expect(log).toEqual(["outer-each"]);
  });

  describe("middle", () => {
    beforeEach(function* () {
      let log = yield* Log.expect();
      log.push("middle-each");
    });

    it("runs both outer and middle beforeEach", function* () {
      let log = yield* Log.expect();
      expect(log).toEqual(["outer-each", "middle-each"]);
    });

    describe("inner", () => {
      beforeEach(function* () {
        let log = yield* Log.expect();
        log.push("inner-each");
      });

      it("runs all three levels of beforeEach", function* () {
        let log = yield* Log.expect();
        expect(log).toEqual(["outer-each", "middle-each", "inner-each"]);
      });
    });
  });

  it("outer scope is not affected by inner beforeEach", function* () {
    let log = yield* Log.expect();
    expect(log).toEqual(["outer-each"]);
  });
});
