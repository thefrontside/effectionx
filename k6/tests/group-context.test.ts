/**
 * Group Context Tests
 *
 * Tests that verify group context is properly preserved across
 * async operations, solving K6's group context loss problem
 * (issues #2848, #5435).
 */

import { testMain, describe, it, expect } from "../testing/mod.ts";
import { group, withGroup, useGroups, useTags, http } from "../lib/mod.ts";

// K6 options
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ["rate==1"], // All checks must pass
  },
};

export default testMain(function* () {
  describe("Group Context Preservation", () => {
    describe("group() function", () => {
      it("appends group to current context", function* () {
        yield* group("api-tests");
        const groups = yield* useGroups();
        expect(groups).toContain("api-tests");
      });

      it("accumulates multiple groups in same scope", function* () {
        yield* group("first");
        yield* group("second");
        const groups = yield* useGroups();
        expect(groups).toHaveLength(2);
        expect(groups).toContain("first");
        expect(groups).toContain("second");
      });

      it("preserves context after HTTP call", function* () {
        yield* group("http-test");
        yield* http.get("https://test.k6.io");
        const groups = yield* useGroups();
        expect(groups).toContain("http-test");
      });

      it("preserves context after multiple HTTP calls", function* () {
        yield* group("multi-http");
        yield* http.get("https://test.k6.io");
        yield* http.get("https://test.k6.io/contacts.php");
        const groups = yield* useGroups();
        expect(groups).toContain("multi-http");
      });
    });

    describe("withGroup() function", () => {
      it("creates scoped nested context", function* () {
        yield* group("outer");

        yield* withGroup("inner", function* () {
          const groups = yield* useGroups();
          expect(groups).toHaveLength(2);
          expect(groups[0]).toBe("outer");
          expect(groups[1]).toBe("inner");
        });
      });

      it("restores context after withGroup returns", function* () {
        yield* group("outer");

        yield* withGroup("inner", function* () {
          // Inside withGroup
        });

        const groups = yield* useGroups();
        expect(groups).toHaveLength(1);
        expect(groups[0]).toBe("outer");
      });

      it("preserves context across HTTP in nested group", function* () {
        yield* group("outer");

        yield* withGroup("inner", function* () {
          yield* http.get("https://test.k6.io");
          const groups = yield* useGroups();
          expect(groups).toContain("inner");
        });
      });

      it("handles deeply nested withGroups", function* () {
        yield* withGroup("level1", function* () {
          yield* withGroup("level2", function* () {
            yield* withGroup("level3", function* () {
              const groups = yield* useGroups();
              expect(groups).toHaveLength(3);
              expect(groups).toEqual(["level1", "level2", "level3"]);
            });
          });
        });
      });
    });

    describe("useGroups() function", () => {
      it("returns empty array when no groups set", function* () {
        const groups = yield* useGroups();
        expect(groups).toEqual([]);
      });

      it("returns array copy (not reference)", function* () {
        yield* group("test");
        const groups1 = yield* useGroups();
        const groups2 = yield* useGroups();
        expect(groups1).not.toBe(groups2);
        expect(groups1).toEqual(groups2);
      });
    });

    describe("useTags() function", () => {
      it("includes group in tags", function* () {
        yield* group("tagged-group");
        const tags = yield* useTags();
        expect(tags.group).toBe("tagged-group");
      });

      it("formats nested groups with :: separator", function* () {
        yield* group("outer");
        yield* group("inner");
        const tags = yield* useTags();
        expect(tags.group).toBe("outer::inner");
      });
    });
  });
});
