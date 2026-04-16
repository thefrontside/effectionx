import * as path from "node:path";
import type { Stats } from "node:fs";
import { describe, it } from "@effectionx/vitest";
import { scoped } from "effection";
import { expect } from "expect";

import * as fsp from "node:fs/promises";
import { until } from "effection";
import {
  FsApi,
  cwd,
  emptyDir,
  ensureDir,
  ensureFile,
  exists,
  readTextFile,
  readdir,
  rm,
  stat,
  writeTextFile,
} from "./mod.ts";

const tmp = path.join(import.meta.dirname!, ".tmp-test");

describe("FsApi middleware", () => {
  it("can intercept readTextFile with logging", function* () {
    let reads: string[] = [];

    yield* ensureDir(tmp);
    let file = path.join(tmp, "log-test.txt");
    yield* writeTextFile(file, "hello");

    yield* FsApi.around({
      *readTextFile(args, next) {
        reads.push(args[0]);
        return yield* next(...args);
      },
    });

    let content = yield* readTextFile(file);
    expect(content).toBe("hello");
    expect(reads).toEqual([file]);

    yield* rm(tmp, { recursive: true, force: true });
  });

  it("returns the current working directory", function* () {
    let dir = yield* cwd();
    expect(dir).toBe(process.cwd());
  });

  it("can mock cwd", function* () {
    yield* FsApi.around({
      *cwd(_args, _next) {
        return "/mocked/working/dir";
      },
    });

    let dir = yield* cwd();
    expect(dir).toBe("/mocked/working/dir");
  });

  it("can mock stat to return fake stats", function* () {
    yield* FsApi.around({
      *stat(_args, _next) {
        return {
          isFile: () => true,
          isDirectory: () => false,
          isBlockDevice: () => false,
          isCharacterDevice: () => false,
          isSymbolicLink: () => false,
          isFIFO: () => false,
          isSocket: () => false,
          size: 42,
        } as Stats;
      },
    });

    let stats = yield* stat("/nonexistent/file");
    expect(stats.isFile()).toBe(true);
    expect(stats.size).toBe(42);
  });

  it("can mock exists to return true for a missing path", function* () {
    yield* FsApi.around({
      *exists(_args, _next) {
        return true;
      },
    });

    let result = yield* exists("/definitely/does/not/exist");
    expect(result).toBe(true);
  });

  it("ensureDir middleware observes args and delegates", function* () {
    let observed: string[] = [];
    let dir = path.join(tmp, "ensure-dir-observe");

    yield* FsApi.around({
      *ensureDir(args, next) {
        observed.push(String(args[0]));
        return yield* next(...args);
      },
    });

    yield* ensureDir(dir);

    expect(observed).toEqual([dir]);
    let stats = yield* until(fsp.stat(dir));
    expect(stats.isDirectory()).toBe(true);

    yield* rm(tmp, { recursive: true, force: true });
  });

  it("ensureFile fires nested writeTextFile middleware", function* () {
    let writes: string[] = [];
    let file = path.join(tmp, "ensure-file-nested", "new.txt");

    // Make sure the file doesn't exist so ensureFile takes the create branch
    yield* rm(tmp, { recursive: true, force: true });

    yield* FsApi.around({
      *writeTextFile(args, next) {
        writes.push(String(args[0]));
        return yield* next(...args);
      },
    });

    yield* ensureFile(file);

    expect(writes).toEqual([file]);
    expect(yield* exists(file)).toBe(true);

    yield* rm(tmp, { recursive: true, force: true });
  });

  it("emptyDir fires nested rm middleware for each child", function* () {
    let removals: string[] = [];
    let dir = path.join(tmp, "empty-dir-nested");

    yield* ensureDir(dir);
    yield* writeTextFile(path.join(dir, "a.txt"), "a");
    yield* writeTextFile(path.join(dir, "b.txt"), "b");

    yield* FsApi.around({
      *rm(args, next) {
        removals.push(String(args[0]));
        return yield* next(...args);
      },
    });

    yield* emptyDir(dir);

    expect(removals.sort()).toEqual(
      [path.join(dir, "a.txt"), path.join(dir, "b.txt")].sort(),
    );
    let remaining = yield* readdir(dir);
    expect(remaining).toEqual([]);

    yield* rm(tmp, { recursive: true, force: true });
  });

  it("middleware is scoped and does not leak", function* () {
    let outerCalls: string[] = [];

    yield* ensureDir(tmp);
    let file = path.join(tmp, "scope-test.txt");
    yield* writeTextFile(file, "data");

    yield* FsApi.around({
      *readTextFile(args, next) {
        outerCalls.push("outer");
        return yield* next(...args);
      },
    });

    yield* readTextFile(file);
    expect(outerCalls).toEqual(["outer"]);

    yield* scoped(function* () {
      let innerCalls: string[] = [];

      yield* FsApi.around({
        *readTextFile(args, next) {
          innerCalls.push("inner");
          return yield* next(...args);
        },
      });

      yield* readTextFile(file);
      expect(outerCalls).toEqual(["outer", "outer"]);
      expect(innerCalls).toEqual(["inner"]);
    });

    // After child scope, inner middleware is gone
    outerCalls.length = 0;
    yield* readTextFile(file);
    expect(outerCalls).toEqual(["outer"]);

    yield* rm(tmp, { recursive: true, force: true });
  });
});
