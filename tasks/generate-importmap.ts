#!/usr/bin/env -S deno run --allow-read --allow-write

import { expandGlob } from "jsr:@std/fs@^1";

interface DenoConfig {
  imports?: Record<string, string>;
}

const rootDir = new URL("..", import.meta.url).pathname;
const imports = new Map<string, string>();

// Walk through all deno.json files
for await (const file of expandGlob("**/deno.json", {
  root: rootDir,
  exclude: ["node_modules", "build"],
})) {
  const content = await Deno.readTextFile(file.path);
  const config: DenoConfig = JSON.parse(content);

  if (config.imports) {
    for (const [key, value] of Object.entries(config.imports)) {
      // Skip internal @effectionx packages unless they use npm:
      if (key.startsWith("@effectionx/") && !value.startsWith("npm:")) {
        continue;
      }

      // Only include external dependencies (jsr: or npm:)
      if (value.startsWith("jsr:") || value.startsWith("npm:")) {
        imports.set(key, value);
      }
    }
  }
}

// Add effection v4
imports.set("effection", "npm:effection@^4.0.0-0");

// Sort by key
const sortedImports = Object.fromEntries(
  Array.from(imports.entries()).sort(([a], [b]) => a.localeCompare(b))
);

const output = {
  "// To regenerate this file": "run: deno task generate-importmap",
  "// Description": "Collects all unique external dependencies from workspace packages' deno.json files",
  imports: sortedImports,
};

const outputPath = `${rootDir}/v4.importmap.json`;
await Deno.writeTextFile(
  outputPath,
  JSON.stringify(output, null, 2) + "\n"
);

console.log(`Generated ${outputPath} with ${imports.size} dependencies`);
