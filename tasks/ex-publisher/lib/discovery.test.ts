import { afterEach, beforeEach, describe, it } from "bdd";
import { expect } from "expect";
import { run } from "npm:effection@3.6.0";
import { ensureDir } from "jsr:@std/fs";
import { join } from "jsr:@std/path";
import { type DiscoveredExtension, discoverExtensions } from "./discovery.ts";
import { loadExtensionConfig } from "./discovery.ts";

describe("Extension Discovery - Basic", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await Deno.makeTempDir({ prefix: "ex-publisher-test-" });
  });

  afterEach(async () => {
    await Deno.remove(testDir, { recursive: true });
  });

  async function createBasicWorkspaceFixture() {
    // Create workspace deno.json
    await Deno.writeTextFile(
      join(testDir, "deno.json"),
      JSON.stringify(
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
    );

    // Create unicorn-helpers extension
    const unicornDir = join(testDir, "unicorn-helpers");
    await ensureDir(unicornDir);

    await Deno.writeTextFile(
      join(unicornDir, "ex-publisher.ts"),
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'unicorn-helpers',
  description: 'Magical utilities for unicorn management',
  effection: ['3', '4'],
  registries: ['npm', 'jsr']
});`,
    );

    await Deno.writeTextFile(
      join(unicornDir, "deno.json"),
      JSON.stringify(
        {
          name: "@effectionx/unicorn-helpers",
          version: "3.1.4",
          exports: "./mod.ts",
        },
        null,
        2,
      ),
    );

    await Deno.writeTextFile(
      join(unicornDir, "mod.ts"),
      '// Magical utilities for unicorn management\nexport * from "./lib/unicorns.ts";',
    );

    // Create dragon-toolkit extension
    const dragonDir = join(testDir, "dragon-toolkit");
    await ensureDir(dragonDir);

    await Deno.writeTextFile(
      join(dragonDir, "ex-publisher.ts"),
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'dragon-toolkit',
  description: 'Advanced dragon taming utilities',
  effection: ['4'],
  registries: ['jsr']
});`,
    );

    await Deno.writeTextFile(
      join(dragonDir, "deno.json"),
      JSON.stringify(
        {
          name: "@effectionx/dragon-toolkit",
          version: "2.7.1",
          exports: "./mod.ts",
        },
        null,
        2,
      ),
    );

    await Deno.writeTextFile(
      join(dragonDir, "mod.ts"),
      '// Advanced dragon taming utilities\nexport * from "./lib/dragons.ts";',
    );
  }

  it("should discover all extensions in a workspace", async () => {
    await createBasicWorkspaceFixture();

    await run(function* () {
      const extensions = yield* discoverExtensions(testDir);

      expect(extensions).toHaveLength(2);
      expect(extensions.map((ext) => ext.name)).toEqual(
        expect.arrayContaining(["unicorn-helpers", "dragon-toolkit"]),
      );
    });
  });

  it("should return extension metadata for each discovered extension", async () => {
    await createBasicWorkspaceFixture();

    await run(function* () {
      const extensions = yield* discoverExtensions(testDir);

      const unicornHelpers = extensions.find((ext) =>
        ext.name === "unicorn-helpers"
      );
      expect(unicornHelpers).toEqual({
        name: "unicorn-helpers",
        path: join(testDir, "unicorn-helpers"),
        config: {
          name: "unicorn-helpers",
          description: "Magical utilities for unicorn management",
          effection: ["3", "4"],
          registries: ["npm", "jsr"],
        },
        version: "3.1.4",
      });

      const dragonToolkit = extensions.find((ext) =>
        ext.name === "dragon-toolkit"
      );
      expect(dragonToolkit).toEqual({
        name: "dragon-toolkit",
        path: join(testDir, "dragon-toolkit"),
        config: {
          name: "dragon-toolkit",
          description: "Advanced dragon taming utilities",
          effection: ["4"],
          registries: ["jsr"],
        },
        version: "2.7.1",
      });
    });
  });

  it("should handle empty workspace", async () => {
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
      const extensions = yield* discoverExtensions(testDir);
      expect(extensions).toHaveLength(0);
    });
  });
});

describe("Configuration Loading", () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await Deno.makeTempDir({ prefix: "ex-publisher-config-test-" });
  });

  afterEach(async () => {
    await Deno.remove(testDir, { recursive: true });
  });

  it("should load and validate a properly formatted configuration", async () => {
    const configPath = join(testDir, "ex-publisher.ts");

    await Deno.writeTextFile(
      configPath,
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'test-extension',
  description: 'A test extension for validation',
  effection: ['3', '4'],
  registries: ['npm', 'jsr']
});`,
    );

    await run(function* () {
      const config = yield* loadExtensionConfig(configPath);

      expect(config).toEqual({
        name: "test-extension",
        description: "A test extension for validation",
        effection: ["3", "4"],
        registries: ["npm", "jsr"],
      });
    });
  });

  it("should load configuration with minimal required fields", async () => {
    const configPath = join(testDir, "ex-publisher.ts");

    await Deno.writeTextFile(
      configPath,
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'minimal-extension',
  description: 'Minimal test extension',
  effection: ['4'],
  registries: ['jsr']
});`,
    );

    await run(function* () {
      const config = yield* loadExtensionConfig(configPath);

      expect(config).toEqual({
        name: "minimal-extension",
        description: "Minimal test extension",
        effection: ["4"],
        registries: ["jsr"],
      });
    });
  });

  it("should load configuration with multiple effection versions", async () => {
    const configPath = join(testDir, "ex-publisher.ts");

    await Deno.writeTextFile(
      configPath,
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'multi-version-extension',
  description: 'Extension supporting multiple Effection versions',
  effection: ['3', '4', '5'],
  registries: ['npm', 'jsr']
});`,
    );

    await run(function* () {
      const config = yield* loadExtensionConfig(configPath);

      expect(config.effection).toEqual(["3", "4", "5"]);
      expect(config.name).toBe("multi-version-extension");
    });
  });

  it("should load configuration with only npm registry", async () => {
    const configPath = join(testDir, "ex-publisher.ts");

    await Deno.writeTextFile(
      configPath,
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'npm-only-extension',
  description: 'Extension published only to NPM',
  effection: ['3'],
  registries: ['npm']
});`,
    );

    await run(function* () {
      const config = yield* loadExtensionConfig(configPath);

      expect(config.registries).toEqual(["npm"]);
      expect(config.name).toBe("npm-only-extension");
    });
  });
});
