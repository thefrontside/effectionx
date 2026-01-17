import * as fsp from "node:fs/promises";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { beforeEach, describe, it } from "@effectionx/bdd";
import { each, until } from "effection";
import { expect } from "expect";

import { JSONLStore } from "./jsonl.ts";
import type { Store } from "./types.ts";

describe("JSONLStore", () => {
  let store: Store;
  let tmpDir: string;

  async function readTmpFile(fileName: string) {
    return await fsp.readFile(`${tmpDir}/${fileName}`, "utf-8");
  }

  async function writeTmpFile(fileName: string, data: string) {
    await fsp.mkdir(join(tmpDir, dirname(fileName)), {
      recursive: true,
    });
    await fsp.writeFile(join(tmpDir, fileName), data, "utf-8");
  }

  async function appendTmpFile(fileName: string, data: string) {
    const destination = join(tmpDir, fileName);
    await fsp.appendFile(destination, data, "utf-8");
  }

  beforeEach(function* () {
    tmpDir = yield* until(mkdtemp(join(tmpdir(), "jsonl-test-")));
    store = JSONLStore.from({ location: tmpDir });
  });

  describe("from", () => {
    it("ensures trailing slash for string path", function* () {
      const store = JSONLStore.from({ location: "/foo" });
      expect(store.location.protocol).toEqual("file:");
      expect(store.location.pathname.endsWith("/foo/")).toBe(true);
    });
    it("ensures trailing slash for URL", function* () {
      const store = JSONLStore.from({
        location: new URL(".cache", "file:///usr/"),
      });
      expect(store.location.protocol).toEqual("file:");
      expect(store.location.pathname.endsWith("/usr/.cache/")).toBe(true);
    });
  });

  it("writes to a file", function* () {
    yield* store.write("hello", "world");
    expect(yield* until(readTmpFile("hello.jsonl"))).toBe('"world"\n');
  });

  it("appends to a file", function* () {
    yield* store.write("hello", "1");
    yield* store.append("hello", "2");
    expect(yield* until(readTmpFile("hello.jsonl"))).toBe('"1"\n"2"\n');
  });

  describe("clearing store", () => {
    beforeEach(function* () {
      yield* until(writeTmpFile("hello.jsonl", "world\n"));
    });
    it("clears store when called clear", function* () {
      yield* store.clear();
      const entries = yield* until(fsp.readdir(tmpDir));
      expect(entries).toHaveLength(0);
    });
  });

  describe("reading content of a file", () => {
    beforeEach(function* () {
      yield* until(
        fsp.writeFile(join(tmpDir, "test.jsonl"), "1\n2\n3\n", "utf-8"),
      );
    });
    it("streams multiple items", function* () {
      const items: number[] = [];
      for (const item of yield* each(store.read<number>("test"))) {
        items.push(item);
        yield* each.next();
      }
      expect(items).toEqual([1, 2, 3]);
    });
  });

  describe("checking presence of store", () => {
    beforeEach(function* () {
      yield* until(writeTmpFile("1.jsonl", "1\n"));
    });
    it("returns true when file exists", function* () {
      let result: boolean | undefined = undefined;
      result = yield* store.has("1");
      expect(result).toBe(true);
    });
    it("returns false when file does not exists", function* () {
      let result: boolean | undefined = undefined;
      result = yield* store.has("2");
      expect(result).toBe(false);
    });
  });

  describe("finds stored files using glob", () => {
    beforeEach(function* () {
      yield* until(writeTmpFile("subdir/1.jsonl", "1\n"));
      yield* until(writeTmpFile("subdir/2.jsonl", "2\n"));
      yield* until(writeTmpFile("subdir/3.jsonl", "3\n"));
    });
    it("streams multiple items", function* () {
      const items: number[] = [];
      for (const item of yield* each(store.find<number>("subdir/*"))) {
        items.push(item);
        yield* each.next();
      }
      expect(items.sort()).toEqual([1, 2, 3]);
    });

    describe("multiple values in a single file", () => {
      beforeEach(function* () {
        yield* until(appendTmpFile("subdir/2.jsonl", "2.1\n"));
      });
      it("streams all lines from globbed files", function* () {
        const items: number[] = [];
        for (const item of yield* each(store.find<number>("subdir/*"))) {
          items.push(item);
          yield* each.next();
        }
        expect(items.sort()).toEqual([1, 2, 2.1, 3]);
      });
    });
  });
});
