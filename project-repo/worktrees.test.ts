import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, beforeEach, describe, it } from "@effectionx/bdd";
import {
  emptyDir,
  ensureDir,
  exists,
  readdir,
  writeTextFile,
} from "@effectionx/fs";
import { exec } from "@effectionx/process";
import { expect } from "expect";

import { initWorktrees, useWorktree } from "./mod.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "test-tmp", "worktrees-test");

describe("worktrees", () => {
  describe("initWorktrees", () => {
    beforeEach(function* () {
      yield* emptyDir(testDir);
    });

    it("creates the worktrees directory", function* () {
      const worktreesDir = path.join(testDir, "worktrees");

      yield* initWorktrees(worktreesDir);

      expect(yield* exists(worktreesDir)).toBe(true);
    });

    it("cleans the directory by default", function* () {
      const worktreesDir = path.join(testDir, "worktrees");
      yield* ensureDir(worktreesDir);
      yield* writeTextFile(path.join(worktreesDir, "old.txt"), "old");

      yield* initWorktrees(worktreesDir);

      const contents = yield* readdir(worktreesDir);
      expect(contents).toHaveLength(0);
    });

    it("preserves contents when clean is false", function* () {
      const worktreesDir = path.join(testDir, "worktrees");
      yield* ensureDir(worktreesDir);
      yield* writeTextFile(path.join(worktreesDir, "keep.txt"), "keep");

      yield* initWorktrees(worktreesDir, { clean: false });

      const contents = yield* readdir(worktreesDir);
      expect(contents).toContain("keep.txt");
    });
  });

  describe("useWorktree", () => {
    const repoDir = path.join(testDir, "repo");
    const worktreesDir = path.join(testDir, "worktrees");

    beforeAll(function* () {
      // Create a self-contained test git repository
      yield* emptyDir(testDir);
      yield* ensureDir(repoDir);
      yield* exec("git init", { cwd: repoDir }).expect();
      yield* exec("git config user.email 'test@test.com'", {
        cwd: repoDir,
      }).expect();
      yield* exec("git config user.name 'Test'", { cwd: repoDir }).expect();
      yield* writeTextFile(path.join(repoDir, "file.txt"), "content");
      yield* exec("git add .", { cwd: repoDir }).expect();
      yield* exec("git commit -m 'initial'", { cwd: repoDir }).expect();
      yield* exec("git branch test-branch", { cwd: repoDir }).expect();
    });

    beforeEach(function* () {
      // Clean worktrees directory between tests
      yield* emptyDir(worktreesDir);
      // Prune any stale worktree references
      yield* exec("git worktree prune", { cwd: repoDir }).expect();
    });

    it("creates a worktree for a branch", function* () {
      yield* initWorktrees(worktreesDir, { cwd: repoDir });

      const worktreePath = yield* useWorktree("test-branch");

      expect(yield* exists(worktreePath)).toBe(true);
      expect(yield* exists(path.join(worktreePath, "file.txt"))).toBe(true);
    });

    it("reuses existing worktree", function* () {
      yield* initWorktrees(worktreesDir, { cwd: repoDir });

      const path1 = yield* useWorktree("test-branch");
      const path2 = yield* useWorktree("test-branch");

      expect(path1).toBe(path2);
    });
  });
});
