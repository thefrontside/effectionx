import { expect } from "@std/expect";
import { dirname, join } from "@std/path";
import { beforeEach, describe, it } from "@std/testing/bdd";
import { each, run } from "effection";
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

  beforeEach(async () => {
    tmpDir = await Deno.makeTempDir();
    store = JSONLStore.from({ location: tmpDir });
  });

  describe("from", () => {
    it("ensures trailing slash for string path", () => {
      const store = JSONLStore.from({ location: "/foo" });
      expect(`${store.location}`).toEqual("file:///foo/");
    });
    it("ensures trailing slash for URL", () => {
      const store = JSONLStore.from({
        location: new URL(".cache", "file:///usr/"),
      });
      expect(`${store.location}`).toEqual("file:///usr/.cache/");
    });
  });

  it("writes to a file", async () => {
    await run(function* () {
      yield* store.write("hello", "world");
    });
    expect(await readTmpFile("hello.jsonl")).toBe('"world"\n');
  });

  it("appends to a file", async () => {
    await run(function* () {
      yield* store.write("hello", "1");
      yield* store.append("hello", "2");
    });
    expect(await readTmpFile("hello.jsonl")).toBe('"1"\n"2"\n');
  });

  describe("clearing store", () => {
    beforeEach(async () => {
      await writeTmpFile("hello.jsonl", "world\n");
    });
    it("clears store when called clear", async () => {
      await run(function* () {
        yield* store.clear();
      });
      const entries = [];
      for await (const dirEntry of Deno.readDir(tmpDir)) {
        entries.push(dirEntry);
      }
      expect(entries).toHaveLength(0);
    });
  });

  describe("reading content of a file", () => {
    beforeEach(async () => {
      await Deno.writeTextFile(join(tmpDir, "test.jsonl"), `1\n2\n3\n`);
    });
    it("streams multiple items", async () => {
      const items: number[] = [];
      await run(function* () {
        for (const item of yield* each(store.read<number>("test"))) {
          items.push(item);
          yield* each.next();
        }
      });
      expect(items).toEqual([1, 2, 3]);
    });
  });

  describe("checking presence of store", () => {
    beforeEach(async () => {
      await writeTmpFile("1.jsonl", "1\n");
    });
    it("returns true when file exists", async () => {
      let result: boolean | undefined = undefined;
      await run(function* () {
        result = yield* store.has("1");
      });
      expect(result).toBe(true);
    });
    it("returns false when file does not exists", async () => {
      let result: boolean | undefined = undefined;
      await run(function* () {
        result = yield* store.has("2");
      });
      expect(result).toBe(false);
    });
  });

  describe("finds stored files using glob", () => {
    beforeEach(async () => {
      await writeTmpFile("subdir/1.jsonl", "1\n");
      await writeTmpFile("subdir/2.jsonl", "2\n");
      await writeTmpFile("subdir/3.jsonl", "3\n");
    });
    it("streams multiple items", async () => {
      const items: number[] = [];
      await run(function* () {
        for (const item of yield* each(store.find<number>("subdir/*"))) {
          items.push(item);
          yield* each.next();
        }
      });
      expect(items.sort()).toEqual([1, 2, 3]);
    });
    describe("multiple values in a single file", () => {
      beforeEach(async () => {
        await appendTmpFile("subdir/2.jsonl", "2.1\n");
      });
      it("streams all lines from globbed files", async () => {
        const items: number[] = [];
        await run(function* () {
          for (const item of yield* each(store.find<number>("subdir/*"))) {
            items.push(item);
            yield* each.next();
          }
        });
        expect(items.sort()).toEqual([1, 2, 2.1, 3]);
      });
    });
  });
});
