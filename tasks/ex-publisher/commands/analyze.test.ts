import { afterEach, beforeEach, describe, it } from "bdd";
import { expect } from "expect";
import { run } from "npm:effection@3.6.0";
import { ensureDir } from "jsr:@std/fs";
import { join } from "jsr:@std/path";
import { analyzeCommand } from "./analyze.ts";

describe("Analyze Command", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await Deno.makeTempDir({ prefix: "ex-publisher-analyze-test-" });
  });

  afterEach(async () => {
    await Deno.remove(testDir, { recursive: true });
  });

  async function createWorkspaceWithExtensions() {
    // Create workspace deno.json
    await Deno.writeTextFile(
      join(testDir, "deno.json"),
      JSON.stringify(
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
    );

    // Create phoenix-utils extension
    const phoenixDir = join(testDir, "phoenix-utils");
    await ensureDir(phoenixDir);

    await Deno.writeTextFile(
      join(phoenixDir, "ex-publisher.ts"),
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'phoenix-utils',
  description: 'Utilities for phoenix lifecycle management',
  effection: ['3', '4'],
  registries: ['npm']
});`,
    );

    await Deno.writeTextFile(
      join(phoenixDir, "deno.json"),
      JSON.stringify(
        {
          name: "@effectionx/phoenix-utils",
          version: "1.2.3",
          exports: "./mod.ts",
        },
        null,
        2,
      ),
    );

    // Create wizard-toolkit extension
    const wizardDir = join(testDir, "wizard-toolkit");
    await ensureDir(wizardDir);

    await Deno.writeTextFile(
      join(wizardDir, "ex-publisher.ts"),
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'wizard-toolkit',
  description: 'Advanced spellcasting utilities',
  effection: ['4'],
  registries: ['npm', 'jsr']
});`,
    );

    await Deno.writeTextFile(
      join(wizardDir, "deno.json"),
      JSON.stringify(
        {
          name: "@effectionx/wizard-toolkit",
          version: "0.5.2",
          exports: "./mod.ts",
        },
        null,
        2,
      ),
    );
  }

  it("should return all discovered extensions when no specific extension requested", async () => {
    await createWorkspaceWithExtensions();

    await run(function* () {
      const extensions = yield* analyzeCommand({ 
        verbose: false, 
        workspaceRoot: testDir 
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
    });
  });

  it("should return only the requested extension when extName is specified", async () => {
    await createWorkspaceWithExtensions();

    await run(function* () {
      const extensions = yield* analyzeCommand({
        verbose: false,
        extName: "phoenix-utils",
        workspaceRoot: testDir,
      });

      expect(extensions).toHaveLength(1);
      expect(extensions[0].name).toBe("phoenix-utils");
      expect(extensions[0].version).toBe("1.2.3");
    });
  });

  it("should return empty array when no extensions found", async () => {
    // Create workspace with no extensions
    await Deno.writeTextFile(
      join(testDir, "deno.json"),
      JSON.stringify(
        {
          workspace: [],
          imports: {},
        },
        null,
        2,
      ),
    );

    await run(function* () {
      const extensions = yield* analyzeCommand({ 
        verbose: false, 
        workspaceRoot: testDir 
      });
      expect(extensions).toHaveLength(0);
    });
  });

  it("should return empty array when requested extension not found", async () => {
    await createWorkspaceWithExtensions();

    await run(function* () {
      const extensions = yield* analyzeCommand({
        verbose: false,
        extName: "nonexistent-extension",
        workspaceRoot: testDir,
      });
      expect(extensions).toHaveLength(0);
    });
  });

  it("should work with verbose flag enabled", async () => {
    await createWorkspaceWithExtensions();

    await run(function* () {
      const extensions = yield* analyzeCommand({ 
        verbose: true, 
        workspaceRoot: testDir 
      });
      expect(extensions).toHaveLength(2);
    });
  });

  it("should use custom workspaceRoot when provided", async () => {
    await createWorkspaceWithExtensions();

    // Create empty test directory outside the generator
    const emptyTestDir = await Deno.makeTempDir({ prefix: "empty-test-" });
    await Deno.writeTextFile(
      join(emptyTestDir, "deno.json"),
      JSON.stringify({ workspace: [] }, null, 2)
    );

    try {
      await run(function* () {
        // Test that it works with explicit workspaceRoot
        const extensions = yield* analyzeCommand({ 
          verbose: false, 
          workspaceRoot: testDir 
        });
        expect(extensions).toHaveLength(2);

        // Test that it would find nothing in a different directory
        const emptyExtensions = yield* analyzeCommand({ 
          verbose: false, 
          workspaceRoot: emptyTestDir 
        });
        expect(emptyExtensions).toHaveLength(0);
      });
    } finally {
      await Deno.remove(emptyTestDir, { recursive: true });
    }
  });
});