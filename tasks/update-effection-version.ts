import { expandGlob } from "jsr:@std/fs@^1";
import { join } from "jsr:@std/path@^1";

const rootDir = new URL("..", import.meta.url).pathname;

interface DenoConfig {
  imports?: Record<string, string>;
}

for await (
  const file of expandGlob("**/deno.json", {
    root: rootDir,
    exclude: ["node_modules", "build"],
  })
) {
  const content = await Deno.readTextFile(file.path);
  const config: DenoConfig = JSON.parse(content);

  if (config.imports && config.imports["effection"]) {
    const currentVersion = config.imports["effection"];
    if (currentVersion === "npm:effection@^3") {
      config.imports["effection"] = "npm:effection@^4.0.0-0";

      const updatedContent = JSON.stringify(config, null, 2) + "\n";
      await Deno.writeTextFile(file.path, updatedContent);

      const relativePath = file.path.replace(rootDir, "");
      console.log(`Updated ${relativePath}`);
    }
  }
}

console.log("✓ Effection version update complete");
