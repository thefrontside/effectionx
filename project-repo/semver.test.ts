import { describe, it } from "@effectionx/bdd";
import { expect } from "expect";

import { extractVersion, findLatestSemverTag } from "./mod.ts";

describe("semver", () => {
  describe("extractVersion", () => {
    it("extracts version from tag with v prefix", function* () {
      expect(extractVersion("v3.2.1")).toBe("3.2.1");
    });

    it("extracts version from plain semver", function* () {
      expect(extractVersion("3.2.1")).toBe("3.2.1");
    });

    it("extracts version with prerelease", function* () {
      expect(extractVersion("v1.0.0-beta.1")).toBe("1.0.0-beta.1");
    });

    it("extracts version with build metadata", function* () {
      expect(extractVersion("1.0.0+build.123")).toBe("1.0.0+build.123");
    });

    it("extracts version from complex tag name", function* () {
      expect(extractVersion("release-2.0.0-alpha")).toBe("2.0.0-alpha");
    });

    it("returns 0.0.0 for non-semver strings", function* () {
      expect(extractVersion("not-a-version")).toBe("0.0.0");
      expect(extractVersion("latest")).toBe("0.0.0");
    });
  });

  describe("findLatestSemverTag", () => {
    it("finds the latest tag from a list", function* () {
      const tags = [{ name: "v1.0.0" }, { name: "v2.0.0" }, { name: "v1.5.0" }];

      const latest = findLatestSemverTag(tags);
      expect(latest?.name).toBe("v2.0.0");
    });

    it("handles prerelease versions correctly", function* () {
      const tags = [
        { name: "v1.0.0" },
        { name: "v2.0.0-beta.1" },
        { name: "v1.5.0" },
      ];

      // 2.0.0-beta.1 > 1.5.0 because 2 > 1
      const latest = findLatestSemverTag(tags);
      expect(latest?.name).toBe("v2.0.0-beta.1");
    });

    it("returns undefined for empty array", function* () {
      const latest = findLatestSemverTag([]);
      expect(latest).toBeUndefined();
    });

    it("works with complex tag names", function* () {
      const tags = [
        { name: "effection-v3.0.0" },
        { name: "effection-v4.1.0" },
        { name: "effection-v4.0.0" },
      ];

      const latest = findLatestSemverTag(tags);
      expect(latest?.name).toBe("effection-v4.1.0");
    });
  });
});
