import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { beforeEach, describe, it } from "@effectionx/bdd";
import {
  emptyDir,
  ensureDir,
  exists,
  readdir,
  writeTextFile,
} from "@effectionx/fs";
import { expect } from "expect";

import { initWorktrees, useWorktree } from "./mod.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "test-tmp", "worktrees-test");

describe("worktrees", () => {
  beforeEach(function* () {
    yield* emptyDir(testDir);
  });

  describe("initWorktrees", () => {
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
    it("creates a worktree for a branch", function* () {
      const worktreesDir = path.join(testDir, "worktrees");
      yield* initWorktrees(worktreesDir);

      const worktreePath = yield* useWorktree("main");

      expect(yield* exists(worktreePath)).toBe(true);
      expect(yield* exists(path.join(worktreePath, "package.json"))).toBe(true);
    });

    it("reuses existing worktree", function* () {
      const worktreesDir = path.join(testDir, "worktrees");
      yield* initWorktrees(worktreesDir);

      const path1 = yield* useWorktree("main");
      const path2 = yield* useWorktree("main");

      expect(path1).toBe(path2);
    });
  });
});
