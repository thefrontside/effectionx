import { expect } from "expect";
import { beforeEach, describe, it } from "../testing.ts";
import { createTempDir, type TempDir } from "../testing/temp-dir.ts";
import { analyzeCommand } from "./analyze.ts";
import { setupLogging } from "../testing/logging.ts";
import { createNpmRegistryMockResponse, mockFetch } from "../testing/fetch.ts";

describe("Analyze Command", () => {
  let tempDir: TempDir;

  beforeEach(function* () {
    yield* setupLogging(false);
    tempDir = yield* createTempDir({ prefix: "ex-publisher-analyze-test-" });

    // Setup mock fetch with NPM registry responses
    yield* mockFetch([{
      url: "https://registry.npmjs.org/effection",
      response: createNpmRegistryMockResponse([
        "3.6.0",
        "3.6.1",
        "4.0.0",
        "4.1.0",
        "4.2.1",
        "4.0.0-beta.1",
      ]),
    }]);
  });

  describe("with an empty workspace", () => {
    beforeEach(function* () {
      yield* tempDir.withFiles({
        "deno.json": JSON.stringify(
          {
            workspace: [],
            imports: {},
          },
          null,
          2,
        ),
      });
    });

    it("should return empty array when no extensions found", function* () {
      const extensions = yield* analyzeCommand({
        verbose: false,
        workspaceRoot: tempDir.path,
      });
      expect(extensions).toHaveLength(0);
    });
  });

  describe("with extensions present", () => {
    beforeEach(function* () {
      // Create workspace deno.json
      yield* tempDir.withFiles({
        "deno.json": JSON.stringify(
          {
            workspace: ["./phoenix-utils", "./wizard-toolkit"],
            imports: {
              "bdd": "jsr:@std/testing@1/bdd",
              "expect": "jsr:@std/expect@1",
            },
          },
          null,
          2,
        ),
      });

      // Create phoenix-utils extension
      yield* tempDir.withWorkspace("phoenix-utils", {
        "ex-publisher.ts": `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'phoenix-utils',
  description: 'Utilities for phoenix lifecycle management',
  effection: ['3', '4'],
  registries: ['npm']
});`,
        "deno.json": JSON.stringify(
          {
            name: "@effectionx/phoenix-utils",
            version: "1.2.3",
            exports: "./mod.ts",
          },
          null,
          2,
        ),
      });

      // Create wizard-toolkit extension
      yield* tempDir.withWorkspace("wizard-toolkit", {
        "ex-publisher.ts": `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'wizard-toolkit',
  description: 'Advanced spellcasting utilities',
  effection: ['4'],
  registries: ['npm', 'jsr']
});`,
        "deno.json": JSON.stringify(
          {
            name: "@effectionx/wizard-toolkit",
            version: "0.5.2",
            exports: "./mod.ts",
          },
          null,
          2,
        ),
      });
    });

    it("should return all discovered extensions when no specific extension requested", function* () {
      const extensions = yield* analyzeCommand({
        verbose: false,
        workspaceRoot: tempDir.path,
      });

      expect(extensions).toHaveLength(2);
      expect(extensions.map((ext) => ext.name)).toEqual(
        expect.arrayContaining(["phoenix-utils", "wizard-toolkit"]),
      );

      const phoenixUtils = extensions.find((ext) =>
        ext.name === "phoenix-utils"
      );
      expect(phoenixUtils).toBeDefined();
      expect(phoenixUtils!.name).toBe("phoenix-utils");
      expect(phoenixUtils!.path).toMatch(/phoenix-utils$/);
      expect(phoenixUtils!.config).toEqual({
        name: "phoenix-utils",
        description: "Utilities for phoenix lifecycle management",
        effection: ["3", "4"],
        registries: ["npm"],
      });
      expect(phoenixUtils!.version).toBe("1.2.3");
      expect(phoenixUtils!.resolvedVersions).toEqual([
        { constraint: "3", resolvedVersion: "3.6.1", error: null },
        { constraint: "4", resolvedVersion: "4.2.1", error: null },
      ]);

      const wizardToolkit = extensions.find((ext) =>
        ext.name === "wizard-toolkit"
      );
      expect(wizardToolkit).toBeDefined();
      expect(wizardToolkit!.name).toBe("wizard-toolkit");
      expect(wizardToolkit!.path).toMatch(/wizard-toolkit$/);
      expect(wizardToolkit!.config).toEqual({
        name: "wizard-toolkit",
        description: "Advanced spellcasting utilities",
        effection: ["4"],
        registries: ["npm", "jsr"],
      });
      expect(wizardToolkit!.version).toBe("0.5.2");
      expect(wizardToolkit!.resolvedVersions).toEqual([
        { constraint: "4", resolvedVersion: "4.2.1", error: null },
      ]);
    });

    it("should return only the requested extension when extName is specified", function* () {
      const extensions = yield* analyzeCommand({
        verbose: false,
        extName: "phoenix-utils",
        workspaceRoot: tempDir.path,
      });

      expect(extensions).toHaveLength(1);
      expect(extensions[0].name).toBe("phoenix-utils");
      expect(extensions[0].version).toBe("1.2.3");
      expect(extensions[0].resolvedVersions).toEqual([
        { constraint: "3", resolvedVersion: "3.6.1", error: null },
        { constraint: "4", resolvedVersion: "4.2.1", error: null },
      ]);
    });

    it("should return empty array when requested extension not found", function* () {
      const extensions = yield* analyzeCommand({
        verbose: false,
        extName: "nonexistent-extension",
        workspaceRoot: tempDir.path,
      });
      expect(extensions).toHaveLength(0);
    });

    it("should work with verbose flag enabled", function* () {
      const extensions = yield* analyzeCommand({
        verbose: true,
        workspaceRoot: tempDir.path,
      });
      expect(extensions).toHaveLength(2);
    });
  });

  describe("with resolved Effection versions", () => {
    beforeEach(function* () {
      yield* tempDir.withFiles({
        "deno.json": JSON.stringify(
          {
            workspace: ["./test-extension"],
            imports: {},
          },
          null,
          2,
        ),
      });

      yield* tempDir.withWorkspace("test-extension", {
        "ex-publisher.ts": `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'test-extension',
  description: 'Test extension for version resolution',
  effection: ['3', '4-beta'],
  registries: ['npm']
});`,
        "deno.json": JSON.stringify(
          {
            name: "@effectionx/test-extension",
            version: "1.0.0",
            exports: "./mod.ts",
          },
          null,
          2,
        ),
      });
    });

    it("should include resolved versions for each discovered extension", function* () {
      const extensions = yield* analyzeCommand({
        verbose: false,
        workspaceRoot: tempDir.path,
      });

      expect(extensions).toHaveLength(1);
      expect(extensions[0].resolvedVersions).toEqual([
        { constraint: "3", resolvedVersion: "3.6.1", error: null },
        { constraint: "4-beta", resolvedVersion: "4.0.0-beta.1", error: null },
      ]);
    });

    describe("with different constraints", () => {
      beforeEach(function* () {
        // Update extension to have different constraints
        yield* tempDir.withWorkspace("test-extension", {
          "ex-publisher.ts": `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'test-extension',
  description: 'Test extension for version resolution',
  effection: ['4'],
  registries: ['npm']
});`,
        });
      });

      it("should resolve different Effection version constraints correctly", function* () {
        const extensions = yield* analyzeCommand({
          verbose: false,
          workspaceRoot: tempDir.path,
        });

        expect(extensions[0].resolvedVersions).toEqual([
          { constraint: "4", resolvedVersion: "4.2.1", error: null },
        ]);
      });
    });

    describe("with network errors", () => {
      beforeEach(function* () {
        // Setup fetch with error response
        yield* mockFetch([{
          url: "https://registry.npmjs.org/effection",
          response: new Response("Internal Server Error", { status: 500 }),
        }]);
      });

      it("should handle version resolution errors gracefully", function* () {
        const extensions = yield* analyzeCommand({
          verbose: false,
          workspaceRoot: tempDir.path,
        });

        expect(extensions).toHaveLength(1);
        expect(extensions[0].resolvedVersions).toEqual([
          {
            constraint: "3",
            resolvedVersion: null,
            error: expect.stringContaining("NPM registry request failed"),
          },
          {
            constraint: "4-beta",
            resolvedVersion: null,
            error: expect.stringContaining("NPM registry request failed"),
          },
        ]);
      });
    });

    describe("with multiple extensions", () => {
      beforeEach(function* () {
        // Create second extension with same constraints
        yield* tempDir.withFiles({
          "deno.json": JSON.stringify(
            {
              workspace: ["./test-extension", "./another-extension"],
              imports: {},
            },
            null,
            2,
          ),
        });

        yield* tempDir.withWorkspace("another-extension", {
          "ex-publisher.ts": `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'another-extension',
  description: 'Another test extension',
  effection: ['3', '4-beta'],
  registries: ['npm']
});`,
          "deno.json": JSON.stringify(
            {
              name: "@effectionx/another-extension",
              version: "2.0.0",
              exports: "./mod.ts",
            },
            null,
            2,
          ),
        });
      });

      it("should cache version resolution results across extensions", function* () {
        const extensions = yield* analyzeCommand({
          verbose: false,
          workspaceRoot: tempDir.path,
        });

        expect(extensions).toHaveLength(2);

        // Both extensions should have same resolved versions for same constraints
        const expectedResolution = [
          { constraint: "3", resolvedVersion: "3.6.1", error: null },
          {
            constraint: "4-beta",
            resolvedVersion: "4.0.0-beta.1",
            error: null,
          },
        ];

        expect(extensions[0].resolvedVersions).toEqual(expectedResolution);
        expect(extensions[1].resolvedVersions).toEqual(expectedResolution);
      });
    });

    describe("with prerelease constraints", () => {
      beforeEach(function* () {
        // Setup mock with more prerelease versions
        yield* mockFetch([{
          url: "https://registry.npmjs.org/effection",
          response: createNpmRegistryMockResponse([
            "4.0.0-alpha.1",
            "4.0.0-alpha.2",
            "4.0.0-beta.1",
            "4.0.0-rc.1",
            "4.0.0",
            "4.1.0",
          ]),
        }]);

        // Test different prerelease constraints
        yield* tempDir.withWorkspace("test-extension", {
          "ex-publisher.ts": `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'test-extension',
  description: 'Test extension for prerelease versions',
  effection: ['4-alpha', '4-rc', '4-any'],
  registries: ['npm']
});`,
        });
      });

      it("should work with prerelease version constraints", function* () {
        const extensions = yield* analyzeCommand({
          verbose: false,
          workspaceRoot: tempDir.path,
        });

        expect(extensions[0].resolvedVersions).toEqual([
          {
            constraint: "4-alpha",
            resolvedVersion: "4.0.0-alpha.2",
            error: null,
          },
          { constraint: "4-rc", resolvedVersion: "4.0.0-rc.1", error: null },
          { constraint: "4-any", resolvedVersion: "4.1.0", error: null },
        ]);
      });
    });
  });

  describe("with custom workspaceRoot", () => {
    let emptyTempDir: TempDir;

    beforeEach(function* () {
      // Set up main workspace
      yield* tempDir.withFiles({
        "deno.json": JSON.stringify(
          {
            workspace: ["./phoenix-utils"],
            imports: {},
          },
          null,
          2,
        ),
      });

      yield* tempDir.withWorkspace("phoenix-utils", {
        "ex-publisher.ts": `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'phoenix-utils',
  description: 'Utilities for phoenix lifecycle management',
  effection: ['3', '4'],
  registries: ['npm']
});`,
        "deno.json": JSON.stringify(
          {
            name: "@effectionx/phoenix-utils",
            version: "1.2.3",
            exports: "./mod.ts",
          },
          null,
          2,
        ),
      });

      // Create empty test directory using TempDir resource
      emptyTempDir = yield* createTempDir({ prefix: "empty-test-" });
      yield* emptyTempDir.withFiles({
        "deno.json": JSON.stringify({ workspace: [] }, null, 2),
      });
    });

    it("should use custom workspaceRoot when provided", function* () {
      // Test that it works with explicit workspaceRoot
      const extensions = yield* analyzeCommand({
        verbose: false,
        workspaceRoot: tempDir.path,
      });
      expect(extensions).toHaveLength(1);

      // Test that it would find nothing in a different directory
      const emptyExtensions = yield* analyzeCommand({
        verbose: false,
        workspaceRoot: emptyTempDir.path,
      });
      expect(emptyExtensions).toHaveLength(0);
    });
  });
});
