import { describe, it, expect } from "../../mod.ts";

describe("failing tests", () => {
  it("should fail on assertion error", function* () {
    expect(1).toBe(2);
  });

  it("should fail on thrown error", function* () {
    throw new Error("intentional error");
  });
});
