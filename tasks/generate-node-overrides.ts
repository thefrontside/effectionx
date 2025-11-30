#!/usr/bin/env -S deno run --allow-read --allow-write

/**
 * Generates package.json files with effection version overrides for Node testing.
 * Also updates all workspace package.json files to use the specified version.
 *
 * Usage:
 *   deno run -A tasks/generate-node-overrides.ts       # generates both v3 and v4
 *   deno run -A tasks/generate-node-overrides.ts v4    # generates only v4
 *
 * Output:
 *   package.v3.json - root package.json with effection@^3
 *   package.v4.json - root package.json with effection@^4.0.0-0
 *
 * To test with a specific version:
 *   cp package.v4.json package.json
 *   deno run -A tasks/apply-effection-version.ts v4  # updates workspace packages
 *   deno install
 *   node --experimental-strip-types --test <file>
 */

import { expandGlob } from "@std/fs";
import { fromFileUrl, join } from "@std/path";

const rootDir = fromFileUrl(new URL("..", import.meta.url));

const versions: Record<string, string> = {
  v3: "^3",
  v4: "^4.0.0-0",
};

// Parse CLI args - if specified, only generate that version
const requestedVersion = Deno.args[0];
const versionsToGenerate = requestedVersion
  ? { [requestedVersion]: versions[requestedVersion] }
  : versions;

if (requestedVersion && !versions[requestedVersion]) {
  console.error(`Unknown version: ${requestedVersion}`);
  console.error(`Available versions: ${Object.keys(versions).join(", ")}`);
  Deno.exit(1);
}

// Read current package.json
const packageJsonPath = join(rootDir, "package.json");
const packageJson = JSON.parse(await Deno.readTextFile(packageJsonPath));

for (const [version, effectionVersion] of Object.entries(versionsToGenerate)) {
  // Create the output with effection version in devDependencies
  // This ensures the root has the right version which workspaces will inherit
  const output = {
    ...packageJson,
    // Add effection to root dependencies so it's hoisted with the right version
    dependencies: {
      ...packageJson.dependencies,
      effection: effectionVersion,
    },
  };

  const outputPath = join(rootDir, `package.${version}.json`);
  await Deno.writeTextFile(
    outputPath,
    JSON.stringify(output, null, 2) + "\n",
  );

  console.log(`Generated ${outputPath} with effection@${effectionVersion}`);
}

console.log(`\nTo test with a specific version:`);
console.log(`  1. cp package.v4.json package.json`);
console.log(`  2. rm -rf node_modules && deno install`);
console.log(`  3. node --experimental-strip-types --test <file>`);
