import { until } from "npm:effection@3.6.0";
import { expect } from "expect";
import { beforeEach, describe, it } from "../testing.ts";
import { createTempDir, type TempDir } from "../testing/temp-dir.ts";
import { setupLogging } from "../testing/logging.ts";
import { generateDNTConfig, runDNTBuild, type DNTConfig, type DNTBuildResult } from "./dnt.ts";

describe("DNT Integration", () => {
  let tempDir: TempDir;

  beforeEach(function* () {
    yield* setupLogging(false);
    tempDir = yield* createTempDir({ prefix: "ex-publisher-dnt-test-" });
  });

  describe("generateDNTConfig", () => {
    beforeEach(function* () {
      yield* tempDir.withFiles({
        "deno.json": JSON.stringify({
          name: "@effectionx/fairy-dust",
          version: "1.0.0",
          exports: "./mod.ts",
          imports: {
            "effection": "npm:effection@^3"
          }
        }),
        "mod.ts": `
import { Operation } from "effection";

export function* hello(): Operation<string> {
  return "world";
}`
      });
    });

    it("should create DNT config for specific Effection version", function* () {
      const config = yield* generateDNTConfig({
        extensionPath: tempDir.path,
        effectionVersion: "3.6.0",
        outputDir: `${tempDir.path}/npm`
      });

      expect(config.entryPoints).toEqual(["./mod.ts"]);
      expect(config.outDir).toBe(`${tempDir.path}/npm`);
      expect(config.shims.deno).toBe(true);
      expect(config.mappings["effection"]).toBe("npm:effection@3.6.0");
    });

    it("should include correct package.json metadata", function* () {
      const config = yield* generateDNTConfig({
        extensionPath: tempDir.path,
        effectionVersion: "4.0.0-beta.2",
        outputDir: `${tempDir.path}/npm`,
        packageMetadata: {
          name: "@effectionx/dragon-spells",
          version: "1.0.0",
          description: "Magical dragon spellcasting utilities",
          author: "Wizard Supreme"
        }
      });

      expect(config.package).toEqual({
        name: "@effectionx/dragon-spells",
        version: "1.0.0", 
        description: "Magical dragon spellcasting utilities",
        author: "Wizard Supreme",
        license: "MIT",
        repository: expect.any(Object),
        dependencies: {
          "effection": "4.0.0-beta.2"
        }
      });
    });

    describe("with complex imports", () => {
      beforeEach(function* () {
        yield* tempDir.withFiles({
          "deno.json": JSON.stringify({
            name: "@effectionx/phoenix-feathers",
            version: "1.0.0",
            exports: "./mod.ts",
            imports: {
              "effection": "npm:effection@^3",
              "@std/fs": "jsr:@std/fs@1.0.4",
              "zod": "npm:zod@^3.20.2"
            }
          })
        });
      });

      it("should map Deno imports to Node equivalents", function* () {
        const config = yield* generateDNTConfig({
          extensionPath: tempDir.path,
          effectionVersion: "3.6.0",
          outputDir: `${tempDir.path}/npm`
        });

        expect(config.mappings).toEqual({
          "effection": "npm:effection@3.6.0",
          "@std/fs": "npm:@std/fs@1.0.4",
          "zod": "npm:zod@^3.20.2"
        });
      });
    });

    it("should handle different Effection version constraints", function* () {
      const v3Config = yield* generateDNTConfig({
        extensionPath: tempDir.path,
        effectionVersion: "3.6.1",
        outputDir: `${tempDir.path}/npm-v3`
      });

      const v4Config = yield* generateDNTConfig({
        extensionPath: tempDir.path,
        effectionVersion: "4.0.0-beta.2",
        outputDir: `${tempDir.path}/npm-v4`
      });

      expect(v3Config.mappings["effection"]).toBe("npm:effection@3.6.1");
      expect(v4Config.mappings["effection"]).toBe("npm:effection@4.0.0-beta.2");
      expect(v3Config.outDir).toBe(`${tempDir.path}/npm-v3`);
      expect(v4Config.outDir).toBe(`${tempDir.path}/npm-v4`);
    });
  });

  describe("runDNTBuild", () => {
    beforeEach(function* () {
      yield* tempDir.withFiles({
        "deno.json": JSON.stringify({
          name: "@effectionx/moonbeam-crystals",
          version: "1.0.0",
          exports: "./mod.ts",
          imports: {
            "effection": "npm:effection@^3"
          }
        }),
        "mod.ts": `
import { Operation } from "effection";

export function* hello(): Operation<string> {
  return "world";
}

export function normalFunction(): string {
  return "normal";
}`,
        "mod.test.ts": `
import { expect } from "expect";
import { describe, it } from "bdd";
import { run } from "effection";
import { hello, normalFunction } from "./mod.ts";

describe("Moonbeam Crystals", () => {
  it("should work with effection", async () {
    const result = await run(hello);
    expect(result).toBe("world");
  });

  it("should work with normal functions", () => {
    expect(normalFunction()).toBe("normal");
  });
});`
      });
    });

    it("should execute DNT build process", function* () {
      const config = yield* generateDNTConfig({
        extensionPath: tempDir.path,
        effectionVersion: "3.6.0",
        outputDir: `${tempDir.path}/npm`
      });

      const result = yield* runDNTBuild({
        config,
        workingDir: tempDir.path
      });

      if (!result.success) {
        console.log("DNT build failed:");
        console.log("stderr:", result.stderr);
        console.log("stdout:", result.stdout);
        console.log("exitCode:", result.exitCode);
      }

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      
      // Verify output directory was created
      const npmDir = yield* until(Deno.stat(`${tempDir.path}/npm`));
      expect(npmDir.isDirectory).toBe(true);
      
      // Verify package.json was generated
      const packageJsonContent = yield* until(Deno.readTextFile(`${tempDir.path}/npm/package.json`));
      const packageJson = JSON.parse(packageJsonContent);
      expect(packageJson.name).toBe("@effectionx/moonbeam-crystals");
      expect(packageJson.dependencies.effection).toBe("3.6.0");
    });

    it("should output to specified directory", function* () {
      const customOutputDir = `${tempDir.path}/custom-npm-build`;
      
      const config = yield* generateDNTConfig({
        extensionPath: tempDir.path,
        effectionVersion: "3.6.0",
        outputDir: customOutputDir
      });

      const result = yield* runDNTBuild({
        config,
        workingDir: tempDir.path
      });

      expect(result.success).toBe(true);
      
      // Verify custom output directory was used
      const customDir = yield* until(Deno.stat(customOutputDir));
      expect(customDir.isDirectory).toBe(true);
      
      const packageJsonContent = yield* until(Deno.readTextFile(`${customOutputDir}/package.json`));
      const packageJson = JSON.parse(packageJsonContent);
      expect(packageJson.name).toBe("@effectionx/moonbeam-crystals");
    });

    describe("with broken code", () => {
      beforeEach(function* () {
        // Create invalid TypeScript that should cause DNT to fail
        yield* tempDir.withFiles({
          "deno.json": JSON.stringify({
            name: "@effectionx/broken-spells",
            version: "1.0.0",
            exports: "./mod.ts",
            imports: {
              "effection": "npm:effection@^3"
            }
          }),
          "mod.ts": `
import { Operation } from "effection";
import { NonExistentImport } from "./does-not-exist.ts";

export function* broken(): Operation<string> {
  return NonExistentImport.something();
}`
        });
      });

      it("should handle build failures", function* () {
        const config = yield* generateDNTConfig({
          extensionPath: tempDir.path,
          effectionVersion: "3.6.0",
          outputDir: `${tempDir.path}/npm`
        });

        const result = yield* runDNTBuild({
          config,
          workingDir: tempDir.path
        });

        expect(result.success).toBe(false);
        expect(result.exitCode).toBeGreaterThan(0);
        expect(result.stderr).toContain("Module not found");
      });
    });

    describe("with package metadata", () => {
      let packageMetadata: any;

      beforeEach(function* () {
        packageMetadata = {
          name: "@effectionx/enchanted-scrolls",
          version: "1.0.0",
          description: "Ancient wisdom storage utilities",
          author: "Grand Librarian"
        };
      });

      it("should generate valid Node.js package structure", function* () {
        const config = yield* generateDNTConfig({
          extensionPath: tempDir.path,
          effectionVersion: "3.6.0",
          outputDir: `${tempDir.path}/npm`,
          packageMetadata
        });

        const result = yield* runDNTBuild({
          config,
          workingDir: tempDir.path
        });

        expect(result.success).toBe(true);

        // Verify essential Node.js package files exist
        const files = ["package.json", "esm/mod.js"];
        for (const file of files) {
          const filePath = `${tempDir.path}/npm/${file}`;
          const stat = yield* until(Deno.stat(filePath));
          expect(stat.isFile).toBe(true);
        }

        // Verify package.json has correct structure
        const packageJsonContent = yield* until(Deno.readTextFile(`${tempDir.path}/npm/package.json`));
        const packageJson = JSON.parse(packageJsonContent);
        
        expect(packageJson.name).toBe("@effectionx/enchanted-scrolls");
        expect(packageJson.version).toBe("1.0.0");
        expect(packageJson.description).toBe("Ancient wisdom storage utilities");
        expect(packageJson.author).toBe("Grand Librarian");
        expect(packageJson.dependencies.effection).toBe("3.6.0");
      });
    });
  });

  describe("with different import patterns", () => {
    beforeEach(function* () {
      yield* tempDir.withFiles({
        "deno.json": JSON.stringify({
          name: "@effectionx/mystical-potions",
          version: "2.0.0",
          exports: {
            ".": "./mod.ts",
            "./utils": "./utils.ts"
          },
          imports: {
            "effection": "npm:effection@4.0.0-beta.2",
            "@std/path": "jsr:@std/path@1.0.6",
            "@std/fs": "jsr:@std/fs@1.0.4",
            "zod": "npm:zod@^3.20.2"
          }
        }),
        "mod.ts": `
export * from "./utils.ts";`,
        "utils.ts": `
import { Operation } from "effection";
import { join } from "@std/path";
import { ensureDir } from "@std/fs";
import { z } from "zod";

export function* setupDirectory(path: string): Operation<string> {
  const fullPath = join(Deno.cwd(), path);
  yield* ensureDir(fullPath);
  return fullPath;
}

export const ConfigSchema = z.object({
  name: z.string(),
  version: z.string()
});`
      });
    });

    it("should handle complex import mappings and multiple entry points", function* () {
      const config = yield* generateDNTConfig({
        extensionPath: tempDir.path,
        effectionVersion: "4.0.0-beta.2",
        outputDir: `${tempDir.path}/npm`
      });

      expect(config.entryPoints).toEqual(["./mod.ts", "./utils.ts"]);
      expect(config.mappings).toEqual({
        "effection": "npm:effection@4.0.0-beta.2",
        "@std/path": "npm:@std/path@1.0.6",
        "@std/fs": "npm:@std/fs@1.0.4",
        "zod": "npm:zod@^3.20.2"
      });

      const result = yield* runDNTBuild({
        config,
        workingDir: tempDir.path
      });

      // This should fail because @std packages don't exist on NPM
      expect(result.success).toBe(false);
      expect(result.stderr).toContain("npm install failed");
    });
  });
});