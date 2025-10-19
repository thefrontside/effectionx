#!/usr/bin/env -S deno run --allow-read --allow-write

import { expandGlob } from "@std/fs";
import { fromFileUrl } from "@std/path";

interface DenoConfig {
  name?: string;
  exports?: string | Record<string, string>;
  imports?: Record<string, string>;
}

const rootDir = fromFileUrl(new URL("..", import.meta.url));
const imports = new Map<string, string>();
const workspacePackages = new Map<string, string>();

// First pass: collect all workspace package names and their exports
for await (
  const file of expandGlob("**/deno.json", {
    root: rootDir,
    exclude: ["node_modules", "build"],
  })
) {
  const content = await Deno.readTextFile(file.path);
  const config: DenoConfig = JSON.parse(content);

  if (config.name?.startsWith("@effectionx/")) {
    // Get the default export path
    let exportPath = "./mod.ts"; // fallback
    if (typeof config.exports === "string") {
      exportPath = config.exports;
    } else if (config.exports && typeof config.exports === "object") {
      exportPath = config.exports["."] || config.exports["default"] ||
        "./mod.ts";
    }

    // Get package directory relative to root
    const packageDir = file.path.replace(rootDir, "").replace(
      /[\/\\]deno\.json$/,
      "",
    );
    const fullExportPath = `./${packageDir}/${exportPath.replace("./", "")}`
      .replace(/\\/g, "/");

    workspacePackages.set(config.name, fullExportPath);
  }
}

// Second pass: collect external dependencies and convert workspace packages to local paths
for await (
  const file of expandGlob("**/deno.json", {
    root: rootDir,
    exclude: ["node_modules", "build"],
  })
) {
  const content = await Deno.readTextFile(file.path);
  const config: DenoConfig = JSON.parse(content);

  if (config.imports) {
    for (const [key, value] of Object.entries(config.imports)) {
      // Convert workspace packages to local paths using their actual export
      if (workspacePackages.has(key)) {
        imports.set(key, workspacePackages.get(key)!);
        continue;
      }

      // Skip other internal @effectionx packages
      if (key.startsWith("@effectionx/")) {
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

// Add @std/testing sub-packages if @std/testing is present
if (imports.has("@std/testing")) {
  const testingSpec = imports.get("@std/testing")!;
  // Extract version from "jsr:@std/testing@^1" -> "^1"
  const version = testingSpec.split("@std/testing@")[1];
  imports.set("@std/testing/bdd", `jsr:@std/testing@${version}/bdd`);
  imports.set("@std/testing/mock", `jsr:@std/testing@${version}/mock`);
  imports.set("@std/testing/time", `jsr:@std/testing@${version}/time`);
}

// Sort by key
const sortedImports = Object.fromEntries(
  Array.from(imports.entries()).sort(([a], [b]) => a.localeCompare(b)),
);

const output = {
  imports: sortedImports,
};

const outputPath = `${rootDir}/v4.importmap.json`;
await Deno.writeTextFile(
  outputPath,
  JSON.stringify(output, null, 2) + "\n",
);

console.log(`Generated ${outputPath} with ${imports.size} dependencies`);
