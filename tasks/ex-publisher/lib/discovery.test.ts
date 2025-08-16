import { describe, it, beforeEach, afterEach } from 'bdd';
import { expect } from 'expect';
import { run } from 'npm:effection@3.6.0';
import { ensureDir } from 'jsr:@std/fs';
import { join } from 'jsr:@std/path';
import { discoverExtensions, type DiscoveredExtension } from './discovery.ts';

describe('Extension Discovery - Basic', () => {
  let testDir: string;

  beforeEach(async () => {
    testDir = await Deno.makeTempDir({ prefix: 'ex-publisher-test-' });
  });

  afterEach(async () => {
    await Deno.remove(testDir, { recursive: true });
  });

  async function createBasicWorkspaceFixture() {
    // Create workspace deno.json
    await Deno.writeTextFile(
      join(testDir, 'deno.json'),
      JSON.stringify({
        workspace: ['./unicorn-helpers', './dragon-toolkit'],
        imports: {
          'bdd': 'jsr:@std/testing@1/bdd',
          'expect': 'jsr:@std/expect@1',
        },
      }, null, 2)
    );

    // Create unicorn-helpers extension
    const unicornDir = join(testDir, 'unicorn-helpers');
    await ensureDir(unicornDir);
    
    await Deno.writeTextFile(
      join(unicornDir, 'ex-publisher.ts'),
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'unicorn-helpers',
  description: 'Magical utilities for unicorn management',
  effection: ['3', '4'],
  registries: ['npm', 'jsr']
});`
    );

    await Deno.writeTextFile(
      join(unicornDir, 'deno.json'),
      JSON.stringify({
        name: '@effectionx/unicorn-helpers',
        version: '3.1.4',
        exports: './mod.ts',
      }, null, 2)
    );

    await Deno.writeTextFile(
      join(unicornDir, 'mod.ts'),
      '// Magical utilities for unicorn management\nexport * from "./lib/unicorns.ts";'
    );

    // Create dragon-toolkit extension
    const dragonDir = join(testDir, 'dragon-toolkit');
    await ensureDir(dragonDir);
    
    await Deno.writeTextFile(
      join(dragonDir, 'ex-publisher.ts'),
      `import { defineConfig } from 'ex-publisher';

export default defineConfig({
  name: 'dragon-toolkit',
  description: 'Advanced dragon taming utilities',
  effection: ['4'],
  registries: ['jsr']
});`
    );

    await Deno.writeTextFile(
      join(dragonDir, 'deno.json'),
      JSON.stringify({
        name: '@effectionx/dragon-toolkit',
        version: '2.7.1',
        exports: './mod.ts',
      }, null, 2)
    );

    await Deno.writeTextFile(
      join(dragonDir, 'mod.ts'),
      '// Advanced dragon taming utilities\nexport * from "./lib/dragons.ts";'
    );
  }

  it('should discover all extensions in a workspace', async () => {
    await createBasicWorkspaceFixture();

    await run(function* () {
      const extensions = yield* discoverExtensions(testDir);

      expect(extensions).toHaveLength(2);
      expect(extensions.map(ext => ext.name)).toEqual(
        expect.arrayContaining(['unicorn-helpers', 'dragon-toolkit'])
      );
    });
  });

  it('should return extension metadata for each discovered extension', async () => {
    await createBasicWorkspaceFixture();

    await run(function* () {
      const extensions = yield* discoverExtensions(testDir);

      const unicornHelpers = extensions.find(ext => ext.name === 'unicorn-helpers');
      expect(unicornHelpers).toEqual({
        name: 'unicorn-helpers',
        path: join(testDir, 'unicorn-helpers'),
        config: {
          name: 'unicorn-helpers',
          description: 'Magical utilities for unicorn management',
          effection: ['3', '4'],
          registries: ['npm', 'jsr'],
        },
        version: '3.1.4',
      });

      const dragonToolkit = extensions.find(ext => ext.name === 'dragon-toolkit');
      expect(dragonToolkit).toEqual({
        name: 'dragon-toolkit',
        path: join(testDir, 'dragon-toolkit'),
        config: {
          name: 'dragon-toolkit',
          description: 'Advanced dragon taming utilities',
          effection: ['4'],
          registries: ['jsr'],
        },
        version: '2.7.1',
      });
    });
  });

  it('should handle empty workspace', async () => {
    // Create workspace with no extensions
    await Deno.writeTextFile(
      join(testDir, 'deno.json'),
      JSON.stringify({
        workspace: [],
        imports: {},
      }, null, 2)
    );

    await run(function* () {
      const extensions = yield* discoverExtensions(testDir);
      expect(extensions).toHaveLength(0);
    });
  });
});