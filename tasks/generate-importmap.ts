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

async function getLatestEffectionV4(): Promise<string> {
  const response = await fetch("https://registry.npmjs.org/effection");
  if (!response.ok) {
    throw new Error(`Failed to fetch npm registry: ${response.statusText}`);
  }

  const data: NpmRegistryResponse = await response.json();
  const versions = Object.keys(data.versions);
  const v4Versions = versions.filter((v) => v.startsWith("4."));

  if (v4Versions.length === 0) {
    throw new Error("No v4 versions found for effection");
  }

  v4Versions.sort((a, b) => {
    const parse = (v: string) => {
      const [main, pre] = v.split("-");
      const [major, minor, patch] = main.split(".").map(Number);
      return { major, minor, patch, pre: pre || "" };
    };
    const va = parse(a);
    const vb = parse(b);
    if (va.major !== vb.major) return va.major - vb.major;
    if (va.minor !== vb.minor) return va.minor - vb.minor;
    if (va.patch !== vb.patch) return va.patch - vb.patch;
    if (!va.pre && vb.pre) return 1;
    if (va.pre && !vb.pre) return -1;
    return va.pre.localeCompare(vb.pre);
  });

  return v4Versions[v4Versions.length - 1];
}

function printUsage() {
  console.log(`Usage: generate-importmap.ts <effection-version> [output-file]

Arguments:
  effection-version  Version specifier for effection package
                     Examples: "^3", "3.6.1", "4.0.0-beta.3"
                     Special: "v4" or "latest-v4" fetches latest v4 from npm

  output-file        Output filename (default: importmap.json)

Examples:
  generate-importmap.ts "^3"
  generate-importmap.ts "^3" v3.importmap.json
  generate-importmap.ts v4 v4.importmap.json
  generate-importmap.ts "4.0.0-beta.3" custom.importmap.json`);
}

// Parse arguments
const [versionArg, outputArg] = Deno.args;

if (!versionArg || versionArg === "--help" || versionArg === "-h") {
  printUsage();
  Deno.exit(versionArg ? 0 : 1);
}

// Resolve effection version
let effectionVersion: string;
if (versionArg === "v4" || versionArg === "latest-v4") {
  effectionVersion = await getLatestEffectionV4();
  console.log(`Resolved latest v4: ${effectionVersion}`);
} else {
  effectionVersion = versionArg;
}

const rootDir = fromFileUrl(new URL("..", import.meta.url));
const imports = new Map<string, string>();
const workspacePackages = new Map<string, string>();

// Collect workspace packages
for await (
  const file of expandGlob("**/deno.json", {
    root: rootDir,
    exclude: ["node_modules", "build"],
  })
) {
  const content = await Deno.readTextFile(file.path);
  const config: DenoConfig = JSON.parse(content);

  if (config.name?.startsWith("@effectionx/")) {
    let exportPath = "./mod.ts";
    if (typeof config.exports === "string") {
      exportPath = config.exports;
    } else if (config.exports && typeof config.exports === "object") {
      exportPath = config.exports["."] || config.exports["default"] ||
        "./mod.ts";
    }

    const packageDir = file.path.replace(rootDir, "").replace(
      /[\/\\]deno\.json$/,
      "",
    );
    const fullExportPath = `./${packageDir}/${exportPath.replace("./", "")}`
      .replace(/\\/g, "/");

    workspacePackages.set(config.name, fullExportPath);
  }
}

// Collect dependencies
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
      if (workspacePackages.has(key)) {
        imports.set(key, workspacePackages.get(key)!);
        continue;
      }
      if (key.startsWith("@effectionx/")) {
        continue;
      }
      if (value.startsWith("jsr:") || value.startsWith("npm:")) {
        imports.set(key, value);
      }
    }
  }
}

// Add @std/testing sub-packages
if (imports.has("@std/testing")) {
  const testingSpec = imports.get("@std/testing")!;
  const version = testingSpec.split("@std/testing@")[1];
  imports.set("@std/testing/bdd", `jsr:@std/testing@${version}/bdd`);
  imports.set("@std/testing/mock", `jsr:@std/testing@${version}/mock`);
  imports.set("@std/testing/time", `jsr:@std/testing@${version}/time`);
}

// Set effection version
imports.set("effection", `npm:effection@${effectionVersion}`);

// Sort and output
const sortedImports = Object.fromEntries(
  Array.from(imports.entries()).sort(([a], [b]) => a.localeCompare(b)),
);

const output = { imports: sortedImports };
const outputPath = join(rootDir, outputArg || "importmap.json");

await Deno.writeTextFile(outputPath, JSON.stringify(output, null, 2) + "\n");

console.log(`Generated ${outputPath}`);
console.log(`  effection: npm:effection@${effectionVersion}`);
console.log(`  ${imports.size} total dependencies`);
