import { expandGlob } from "jsr:@std/fs@^1";

const rootDir = new URL("..", import.meta.url).pathname;

interface DenoConfig {
  name?: string;
  version?: string;
  imports?: Record<string, string>;
}

// First, collect all package versions
const packageVersions = new Map<string, string>();

for await (const file of expandGlob("**/deno.json", {
  root: rootDir,
  exclude: ["node_modules", "build"],
})) {
  const content = await Deno.readTextFile(file.path);
  const config: DenoConfig = JSON.parse(content);

  if (config.name && config.version) {
    packageVersions.set(config.name, config.version);
  }
}

console.log("Package versions found:");
for (const [name, version] of packageVersions) {
  console.log(`  ${name}: ${version}`);
}
console.log("");

// Now check for mismatches
let foundMismatches = false;

for await (const file of expandGlob("**/deno.json", {
  root: rootDir,
  exclude: ["node_modules", "build"],
})) {
  const content = await Deno.readTextFile(file.path);
  const config: DenoConfig = JSON.parse(content);
  const relativePath = file.path.replace(rootDir, "");

  if (config.imports) {
    for (const [depName, depSpec] of Object.entries(config.imports)) {
      if (depName.startsWith("@effectionx/")) {
        const actualVersion = packageVersions.get(depName);
        if (actualVersion) {
          // Extract version from spec (handles jsr:@effectionx/foo@version or npm:@effectionx/foo@version)
          const match = depSpec.match(/@effectionx\/[^@]+@(.+)$/);
          if (match) {
            const declaredVersion = match[1];
            // Check if it's a caret version or exact version
            const isCaretVersion = declaredVersion.startsWith("^");
            const versionToCheck = isCaretVersion
              ? declaredVersion.substring(1)
              : declaredVersion;

            if (versionToCheck !== actualVersion) {
              foundMismatches = true;
              console.log(
                `❌ ${relativePath}: ${depName} declared as ${declaredVersion} but actual version is ${actualVersion}`,
              );
            }
          }
        }
      }
    }
  }
}

if (!foundMismatches) {
  console.log("✓ All internal dependency versions match!");
}
