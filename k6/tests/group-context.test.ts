/**
 * Group Context Tests
 *
 * Tests that verify group context is properly preserved across
 * async operations, solving K6's group context loss problem
 * (issues #2848, #5435).
 */

import { testMain, describe, it, expect } from "../testing/mod.ts";
import { group, useGroups, useTags, http } from "../lib/mod.ts";

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

    describe("group(name, op) overload", () => {
      it("creates scoped nested context", function* () {
        yield* group("outer");

        yield* group("inner", function* () {
          const groups = yield* useGroups();
          expect(groups).toHaveLength(2);
          expect(groups[0]).toBe("outer");
          expect(groups[1]).toBe("inner");
        });
      });

      it("restores context after group(name, op) returns", function* () {
        yield* group("outer");

        yield* group("inner", function* () {
          // Inside scoped group overload
        });

        const groups = yield* useGroups();
        expect(groups).toHaveLength(1);
        expect(groups[0]).toBe("outer");
      });

      it("preserves context across HTTP in nested group", function* () {
        yield* group("outer");

        yield* group("inner", function* () {
          yield* http.get("https://test.k6.io");
          const groups = yield* useGroups();
          expect(groups).toContain("inner");
        });
      });

      it("handles deeply nested group(name, op) calls", function* () {
        yield* group("level1", function* () {
          yield* group("level2", function* () {
            yield* group("level3", function* () {
              const groups = yield* useGroups();
              expect(groups).toHaveLength(3);
              expect(groups).toEqual(["level1", "level2", "level3"]);
            });
          });
        });
      });

      it("preserves return values", function* () {
        const value = yield* group("returns-value", function* () {
          return 42;
        });

        expect(value).toBe(42);
      });

      it("rethrows errors from grouped operation", function* () {
        let message = "";

        try {
          yield* group("throws", function* () {
            throw new Error("boom");
          });
        } catch (error) {
          message = (error as Error).message;
        }

        expect(message).toBe("boom");
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
        expect(tags.group).toBe("::tagged-group");
      });

      it("formats nested groups with :: separator", function* () {
        yield* group("outer");
        yield* group("inner");
        const tags = yield* useTags();
        expect(tags.group).toBe("::outer::inner");
      });
    });
  });
});
