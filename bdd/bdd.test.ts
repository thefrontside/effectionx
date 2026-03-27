import { describe, it } from "vitest";

describe("@effectionx/bdd", () => {
  it("should run basic test", () => {
    // passes
  });

  it("should support async operations", async () => {
    await new Promise((resolve) => setTimeout(resolve, 1));
  });
});
