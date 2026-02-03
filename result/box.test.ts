import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";
import { box, unbox } from "./mod.ts";

describe("box", () => {
  it("returns Ok for successful operations", function* () {
    const result = yield* box(function* () {
      return 42;
    });

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value).toBe(42);
    }
  });

  it("returns Err for failed operations", function* () {
    const result = yield* box(function* () {
      throw new Error("test error");
    });

    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.message).toBe("test error");
    }
  });
});

describe("unbox", () => {
  it("extracts value from Ok result", function* () {
    const result = yield* box(function* () {
      return "hello";
    });

    expect(unbox(result)).toBe("hello");
  });

  it("throws error from Err result", function* () {
    const result = yield* box(function* () {
      throw new Error("should throw");
    });

    expect(() => unbox(result)).toThrow("should throw");
  });
});
