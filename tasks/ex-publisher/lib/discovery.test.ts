import { expect } from "expect";
import { beforeEach, describe, it } from "../testing.ts";
import { createTempDir, type TempDir } from "../testing/temp-dir.ts";
import { discoverExtensions } from "./discovery.ts";
import { setupLogging } from "../testing/logging.ts";

describe("Extension Discovery", () => {
  let tempDir: TempDir;

  beforeEach(function* () {
    yield* setupLogging(false);
    tempDir = yield* createTempDir();
  });

  describe("with an empty workspace", () => {
    it("should handle empty workspace", function* () {
      const extensions = yield* discoverExtensions(tempDir.path);
      expect(extensions).toHaveLength(0);
    });
  });

  describe("with extensions present", () => {
    beforeEach(function* () {
      yield* tempDir.withFiles({
        "deno.json": JSON.stringify(
          {
            workspace: ["./unicorn-helpers", "./dragon-toolkit"],
            imports: {
              "bdd": "jsr:@std/testing@1/bdd",
              "expect": "jsr:@std/expect@1",
            },
          },
          null,
          2,
        ),
      });

      yield* tempDir.withWorkspace("unicorn-helpers", {
        "deno.json": JSON.stringify(
          {
            version: "0.1.0",
            exports: "./mod.ts",
          },
          null,
          2,
        ),
        "ex-publisher.ts": `import { defineConfig } from 'ex-publisher';
  
  export default defineConfig({
    name: 'unicorn-helpers',
    description: 'Magical utilities for unicorn management',
    effection: ['3', '4'],
    registries: ['npm', 'jsr']
  });`,
      });

      yield* tempDir.withWorkspace("dragon-toolkit", {
        "deno.json": JSON.stringify(
          {
            version: "0.2.0",
            exports: "./mod.ts",
          },
          null,
          2,
        ),
        "ex-publisher.ts": `import { defineConfig } from 'ex-publisher';
  
  export default defineConfig({
    name: 'dragon-toolkit',
    description: 'Advanced dragon taming utilities',
    effection: ['4'],
    registries: ['jsr']
  });`,
      });
    });

    it("should discover all extensions in a workspace", function* () {
      const extensions = yield* discoverExtensions(tempDir.path);
      expect(extensions).toHaveLength(2);
      expect(extensions.map((ext) => ext.name)).toEqual(
        expect.arrayContaining(["unicorn-helpers", "dragon-toolkit"]),
      );
    });

    it("should return extension metadata for each discovered extension", function* () {
      const extensions = yield* discoverExtensions(tempDir.path);
      expect(extensions).toMatchObject([
        {
          config: {
            name: "unicorn-helpers",
            effection: ["3", "4"],
            registries: ["npm", "jsr"],
          },
        },
        {
          config: {
            name: "dragon-toolkit",
            effection: ["4"],
            registries: ["jsr"],
          },
        },
      ]);
    });
  });
});
