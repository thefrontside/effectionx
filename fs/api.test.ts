import * as path from "node:path";
import type { Stats } from "node:fs";
import { describe, it } from "@effectionx/bdd";
import { scoped } from "effection";
import { expect } from "expect";

import {
  FsApi,
  readTextFile,
  writeTextFile,
  stat,
  readdir,
  rm,
  ensureDir,
  toPath,
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
