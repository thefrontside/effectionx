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

import { initClones } from "./mod.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "test-tmp", "clones-test");

describe("clones", () => {
  beforeEach(function* () {
    yield* emptyDir(testDir);
  });

  describe("initClones", () => {
    it("creates the clones directory", function* () {
      const clonesDir = path.join(testDir, "clones");

      yield* initClones(clonesDir);

      expect(yield* exists(clonesDir)).toBe(true);
    });

    it("cleans the directory by default", function* () {
      const clonesDir = path.join(testDir, "clones");
      yield* ensureDir(clonesDir);
      yield* writeTextFile(path.join(clonesDir, "old.txt"), "old");

      yield* initClones(clonesDir);

      const contents = yield* readdir(clonesDir);
      expect(contents).toHaveLength(0);
    });

    it("preserves contents when clean is false", function* () {
      const clonesDir = path.join(testDir, "clones");
      yield* ensureDir(clonesDir);
      yield* writeTextFile(path.join(clonesDir, "keep.txt"), "keep");

      yield* initClones(clonesDir, { clean: false });

      const contents = yield* readdir(clonesDir);
      expect(contents).toContain("keep.txt");
    });
  });
});
