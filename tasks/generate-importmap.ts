#!/usr/bin/env -S deno run --allow-read --allow-write --allow-net

import { expandGlob } from "@std/fs";
import { fromFileUrl, join } from "@std/path";

interface DenoConfig {
  name?: string;
  exports?: string | Record<string, string>;
  imports?: Record<string, string>;
}

interface NpmRegistryResponse {
  versions: Record<string, unknown>;
}

/**
 * Fetches the latest effection v4 version from the npm registry.
 * Returns the highest v4.x.x version (including prereleases).
 */
async function getLatestEffectionV4(): Promise<string> {
  const response = await fetch("https://registry.npmjs.org/effection");
  if (!response.ok) {
    throw new Error(`Failed to fetch npm registry: ${response.statusText}`);
  }

  const data: NpmRegistryResponse = await response.json();
  const versions = Object.keys(data.versions);

  // Filter to v4.x.x versions only
  const v4Versions = versions.filter((v) => v.startsWith("4."));

  if (v4Versions.length === 0) {
    throw new Error("No v4 versions found for effection");
  }

  // Sort versions using Deno's semver comparison
  // Parse and sort: stable versions first by semver, then prereleases
  v4Versions.sort((a, b) => {
    const parseVersion = (v: string) => {
      const [main, prerelease] = v.split("-");
      const [major, minor, patch] = main.split(".").map(Number);
      return { major, minor, patch, prerelease: prerelease || "" };
    };

    const va = parseVersion(a);
    const vb = parseVersion(b);

    // Compare major.minor.patch first
    if (va.major !== vb.major) return va.major - vb.major;
    if (va.minor !== vb.minor) return va.minor - vb.minor;
    if (va.patch !== vb.patch) return va.patch - vb.patch;

    // If one has prerelease and other doesn't, stable comes after prerelease
    if (!va.prerelease && vb.prerelease) return 1;
    if (va.prerelease && !vb.prerelease) return -1;

    // Both have prereleases, compare alphabetically
    return va.prerelease.localeCompare(vb.prerelease);
  });

  return v4Versions[v4Versions.length - 1];
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

// Add effection v4 - fetch latest version from npm
const effectionV4Version = await getLatestEffectionV4();
imports.set("effection", `npm:effection@${effectionV4Version}`);
console.log(`Using effection v4: ${effectionV4Version}`);

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

const outputPath = join(rootDir, "v4.importmap.json");
await Deno.writeTextFile(
  outputPath,
  JSON.stringify(output, null, 2) + "\n",
);

console.log(`Generated ${outputPath} with ${imports.size} dependencies`);
