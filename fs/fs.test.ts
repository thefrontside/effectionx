import { describe, it, beforeEach } from "@effectionx/bdd";
import { expect } from "expect";
import { each, until } from "effection";
import * as path from "node:path";
import * as fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";

import {
  exists,
  ensureDir,
  ensureFile,
  emptyDir,
  remove,
  readTextFile,
  writeTextFile,
  walk,
  globToRegExp,
} from "./mod.ts";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const testDir = path.join(__dirname, "test-tmp");

describe("@effectionx/fs", () => {
  beforeEach(function* () {
    // Clean up test directory before each test
    yield* until(fsp.rm(testDir, { recursive: true, force: true }));
    yield* until(fsp.mkdir(testDir, { recursive: true }));
  });

  describe("exists", () => {
    it("returns true for existing file", function* () {
      const filePath = path.join(testDir, "exists.txt");
      yield* until(fsp.writeFile(filePath, "hello"));

      expect(yield* exists(filePath)).toBe(true);
    });

    it("returns false for non-existing file", function* () {
      const filePath = path.join(testDir, "does-not-exist.txt");

      expect(yield* exists(filePath)).toBe(false);
    });
  });

  describe("ensureDir", () => {
    it("creates directory if it does not exist", function* () {
      const dirPath = path.join(testDir, "new-dir", "nested");

      yield* ensureDir(dirPath);

      const stat = yield* until(fsp.stat(dirPath));
      expect(stat.isDirectory()).toBe(true);
    });

    it("does not error if directory already exists", function* () {
      const dirPath = path.join(testDir, "existing-dir");
      yield* until(fsp.mkdir(dirPath));

      yield* ensureDir(dirPath);

      const stat = yield* until(fsp.stat(dirPath));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("ensureFile", () => {
    it("creates file and parent directories", function* () {
      const filePath = path.join(testDir, "new-dir", "new-file.txt");

      yield* ensureFile(filePath);

      const stat = yield* until(fsp.stat(filePath));
      expect(stat.isFile()).toBe(true);
    });
  });

  describe("emptyDir", () => {
    it("removes all contents of directory", function* () {
      const dirPath = path.join(testDir, "to-empty");
      yield* until(fsp.mkdir(dirPath));
      yield* until(fsp.writeFile(path.join(dirPath, "file1.txt"), "1"));
      yield* until(fsp.writeFile(path.join(dirPath, "file2.txt"), "2"));

      yield* emptyDir(dirPath);

      const contents = yield* until(fsp.readdir(dirPath));
      expect(contents).toHaveLength(0);
    });

    it("creates directory if it does not exist", function* () {
      const dirPath = path.join(testDir, "new-empty-dir");

      yield* emptyDir(dirPath);

      const stat = yield* until(fsp.stat(dirPath));
      expect(stat.isDirectory()).toBe(true);
    });
  });

  describe("readTextFile / writeTextFile", () => {
    it("reads and writes text files", function* () {
      const filePath = path.join(testDir, "text.txt");
      const content = "Hello, World!";

      yield* writeTextFile(filePath, content);
      const result = yield* readTextFile(filePath);

      expect(result).toBe(content);
    });
  });

  describe("remove", () => {
    it("removes a file", function* () {
      const filePath = path.join(testDir, "to-remove.txt");
      yield* until(fsp.writeFile(filePath, "delete me"));

      yield* remove(filePath);

      expect(yield* exists(filePath)).toBe(false);
    });

    it("removes a directory recursively", function* () {
      const dirPath = path.join(testDir, "to-remove-dir");
      yield* until(fsp.mkdir(dirPath));
      yield* until(fsp.writeFile(path.join(dirPath, "file.txt"), "nested"));

      yield* remove(dirPath, { recursive: true });

      expect(yield* exists(dirPath)).toBe(false);
    });
  });

  describe("walk", () => {
    it("walks directory tree", function* () {
      // Create test structure
      yield* until(fsp.mkdir(path.join(testDir, "walk-test", "sub"), { recursive: true }));
      yield* until(fsp.writeFile(path.join(testDir, "walk-test", "file1.txt"), "1"));
      yield* until(fsp.writeFile(path.join(testDir, "walk-test", "sub", "file2.txt"), "2"));

      const entries: string[] = [];
      for (const entry of yield* each(walk(path.join(testDir, "walk-test")))) {
        entries.push(entry.name);
        yield* each.next();
      }

      expect(entries).toContain("sub");
      expect(entries).toContain("file1.txt");
      expect(entries).toContain("file2.txt");
    });

    it("respects includeFiles option", function* () {
      yield* until(fsp.mkdir(path.join(testDir, "walk-files"), { recursive: true }));
      yield* until(fsp.writeFile(path.join(testDir, "walk-files", "file.txt"), "1"));

      const entries: string[] = [];
      for (const entry of yield* each(walk(path.join(testDir, "walk-files"), { includeFiles: false }))) {
        entries.push(entry.name);
        yield* each.next();
      }

      expect(entries).not.toContain("file.txt");
    });
  });

  describe("globToRegExp", () => {
    it("matches simple wildcards", function* () {
      const regex = globToRegExp("*.ts");
      expect(regex.test("file.ts")).toBe(true);
      expect(regex.test("file.js")).toBe(false);
    });

    it("matches double star glob", function* () {
      const regex = globToRegExp("src/**/*.ts");
      expect(regex.test("src/file.ts")).toBe(true);
      expect(regex.test("src/nested/file.ts")).toBe(true);
      expect(regex.test("other/file.ts")).toBe(false);
    });

    it("matches character classes", function* () {
      const regex = globToRegExp("file[0-9].txt");
      expect(regex.test("file1.txt")).toBe(true);
      expect(regex.test("filea.txt")).toBe(false);
    });

    it("matches braces", function* () {
      const regex = globToRegExp("*.{ts,js}");
      expect(regex.test("file.ts")).toBe(true);
      expect(regex.test("file.js")).toBe(true);
      expect(regex.test("file.txt")).toBe(false);
    });
  });
});
