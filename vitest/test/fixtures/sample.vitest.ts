import { sleep } from "effection";
import { expect } from "vitest";
import { beforeAll, beforeEach, describe, it } from "../../mod.ts";

describe("@effectionx/vitest", () => {
  let counter: number;

  beforeEach(function* () {
    counter = 0;
  });

  it("can run an effection operation", function* () {
    yield* sleep(10);
    expect(1 + 1).toBe(2);
  });

  it("runs beforeEach before each test", function* () {
    counter += 1;
    expect(counter).toBe(1);
  });

  it("resets state between tests", function* () {
    counter += 1;
    expect(counter).toBe(1);
  });

  describe("nested describe", () => {
    it("works in nested suites", function* () {
      yield* sleep(5);
      expect(true).toBe(true);
    });
  });

  describe("beforeAll", () => {
    let setupCount: number;

    beforeAll(function* () {
      setupCount = 0;
    });

    beforeEach(function* () {
      setupCount += 1;
    });

    it("runs beforeAll once before all tests", function* () {
      expect(setupCount).toBe(1);
    });

    it("beforeAll ran only once while beforeEach ran again", function* () {
      expect(setupCount).toBe(2);
    });
  });
});
