import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { createRepo } from "./mod.ts";

describe("repo", () => {
  describe("createRepo", () => {
    it("lists tags matching a pattern", function* () {
      const repo = createRepo({ owner: "thefrontside", name: "effectionx" });

      // This repo has tags like @effection/process-v2.0.0-beta.0
      const tags = yield* repo.tags(/^@effection\/process-v/);

      expect(tags.length).toBeGreaterThan(0);
      expect(tags[0].name).toMatch(/^@effection\/process-v/);
      expect(tags[0].nameWithOwner).toBe("thefrontside/effectionx");
      expect(tags[0].url).toContain("github.com/thefrontside/effectionx/tree/");
    });

    it("finds the latest tag matching a pattern", function* () {
      const repo = createRepo({ owner: "thefrontside", name: "effectionx" });

      const latest = yield* repo.latest(/^@effection\/process-v/);

      expect(latest.name).toMatch(/^@effection\/process-v/);
    });

    it("throws when no tags match", function* () {
      const repo = createRepo({ owner: "thefrontside", name: "effectionx" });

      let error: Error | undefined;
      try {
        yield* repo.latest(/^nonexistent-pattern-/);
      } catch (e) {
        error = e as Error;
      }

      expect(error).toBeDefined();
      expect(error?.message).toContain("Could not retrieve latest tag");
    });
  });
});
