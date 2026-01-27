import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, it } from "@effectionx/bdd";
import { emptyDir, ensureDir, writeTextFile } from "@effectionx/fs";
import { exec } from "@effectionx/process";
import { expect } from "expect";

import { createRepo } from "./mod.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "test-tmp", "repo-test");

describe("repo", () => {
  describe("createRepo", () => {
    const repoDir = path.join(testDir, "repo");

    beforeAll(function* () {
      // Create a self-contained test git repository with tags
      yield* emptyDir(testDir);
      yield* ensureDir(repoDir);
      yield* exec("git init", { cwd: repoDir }).expect();
      yield* exec("git config user.email 'test@test.com'", {
        cwd: repoDir,
      }).expect();
      yield* exec("git config user.name 'Test'", { cwd: repoDir }).expect();

      // Create first commit and tag (lightweight tag - no editor)
      yield* writeTextFile(path.join(repoDir, "file.txt"), "v1");
      yield* exec("git add .", { cwd: repoDir }).expect();
      yield* exec("git commit -m 'v1'", { cwd: repoDir }).expect();
      yield* exec("git tag -a v1.0.0 -m 'v1.0.0'", { cwd: repoDir }).expect();

      // Create second commit and tag
      yield* writeTextFile(path.join(repoDir, "file.txt"), "v2");
      yield* exec("git add .", { cwd: repoDir }).expect();
      yield* exec("git commit -m 'v2'", { cwd: repoDir }).expect();
      yield* exec("git tag -a v2.0.0 -m 'v2.0.0'", { cwd: repoDir }).expect();

      // Create a prerelease tag
      yield* writeTextFile(path.join(repoDir, "file.txt"), "v3-beta");
      yield* exec("git add .", { cwd: repoDir }).expect();
      yield* exec("git commit -m 'v3-beta'", { cwd: repoDir }).expect();
      yield* exec("git tag -a v3.0.0-beta.1 -m 'v3.0.0-beta.1'", {
        cwd: repoDir,
      }).expect();
    });

    it("lists tags matching a pattern", function* () {
      const repo = createRepo({ owner: "test", name: "repo", cwd: repoDir });

      const tags = yield* repo.tags(/^v/);

      expect(tags.length).toBe(3);
      expect(tags.map((t) => t.name)).toContain("v1.0.0");
      expect(tags.map((t) => t.name)).toContain("v2.0.0");
      expect(tags.map((t) => t.name)).toContain("v3.0.0-beta.1");
    });

    it("filters tags by pattern", function* () {
      const repo = createRepo({ owner: "test", name: "repo", cwd: repoDir });

      const tags = yield* repo.tags(/^v[12]\./);

      expect(tags.length).toBe(2);
      expect(tags.map((t) => t.name)).toContain("v1.0.0");
      expect(tags.map((t) => t.name)).toContain("v2.0.0");
    });

    it("returns correct ref structure", function* () {
      const repo = createRepo({ owner: "test", name: "repo", cwd: repoDir });

      const tags = yield* repo.tags(/^v1\./);

      expect(tags.length).toBe(1);
      expect(tags[0].name).toBe("v1.0.0");
      expect(tags[0].nameWithOwner).toBe("test/repo");
      expect(tags[0].url).toBe("https://github.com/test/repo/tree/v1.0.0");
    });

    it("finds the latest tag matching a pattern", function* () {
      const repo = createRepo({ owner: "test", name: "repo", cwd: repoDir });

      const latest = yield* repo.latest(/^v/);

      // v3.0.0-beta.1 is latest because 3 > 2 > 1
      expect(latest.name).toBe("v3.0.0-beta.1");
    });

    it("finds latest stable version when excluding prereleases", function* () {
      const repo = createRepo({ owner: "test", name: "repo", cwd: repoDir });

      // Only match stable versions (no hyphen after version)
      const latest = yield* repo.latest(/^v\d+\.\d+\.\d+$/);

      expect(latest.name).toBe("v2.0.0");
    });

    it("throws when no tags match", function* () {
      const repo = createRepo({ owner: "test", name: "repo", cwd: repoDir });

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
