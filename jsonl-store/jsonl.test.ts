import { expect } from "@std/expect";
import { dirname, join } from "@std/path";
import { beforeEach, describe, it } from "@effectionx/bdd";
import { each, stream, until } from "effection";
import { mkdir } from "node:fs";
import { promisify } from "node:util";

import { JSONLStore } from "./jsonl.ts";
import type { Store } from "./types.ts";

// using promisify there because Deno's ensure doesn't work
// correctly in Node. We should run these tests in Node
// to make sure that it'll work in Node too.

describe("JSONLStore", () => {
  let store: Store;
  let tmpDir: string;

  async function readTmpFile(fileName: string) {
    return await Deno.readTextFile(`${tmpDir}/${fileName}`);
  }

  async function writeTmpFile(fileName: string, data: string) {
    await promisify(mkdir)(join(tmpDir, dirname(fileName)), {
      recursive: true,
    });
    await Deno.writeTextFile(join(tmpDir, fileName), data);
  }

  async function appendTmpFile(fileName: string, data: string) {
    const destination = join(tmpDir, fileName);
    const file = await Deno.open(destination, { append: true });
    await file.write(new TextEncoder().encode(data));
    file.close();
  }

  beforeEach(function* () {
    tmpDir = yield* until(Deno.makeTempDir());
    store = JSONLStore.from({ location: tmpDir });
  });

  describe("from", () => {
    it("ensures trailing slash for string path", function* () {
      const store = JSONLStore.from({ location: "/foo" });
      expect(`${store.location}`).toEqual("file:///foo/");
    });
    it("ensures trailing slash for URL", function* () {
      const store = JSONLStore.from({
        location: new URL(".cache", "file:///usr/"),
      });
      expect(`${store.location}`).toEqual("file:///usr/.cache/");
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
      const entries = [];
      for (const dirEntry of yield* each(stream(Deno.readDir(tmpDir)))) {
        entries.push(dirEntry);
        yield* each.next();
      }
      expect(entries).toHaveLength(0);
    });
  });

  describe("reading content of a file", () => {
    beforeEach(function* () {
      yield* until(Deno.writeTextFile(join(tmpDir, "test.jsonl"), `1\n2\n3\n`));
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
