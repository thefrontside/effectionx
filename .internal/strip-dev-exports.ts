import { promises as fsp } from "node:fs";
import { resolve } from "node:path";

const rootDir = process.cwd();

// Read pnpm-workspace.yaml to find all workspaces
const workspaceYaml = await fsp.readFile(
  resolve(rootDir, "pnpm-workspace.yaml"),
  "utf-8",
);

const workspaces: string[] = [];
for (const line of workspaceYaml.split("\n")) {
  const trimmed = line.trim();
  if (trimmed.startsWith("-")) {
    const value = trimmed.replace(/^-\s*/, "").replace(/^["']|["']$/g, "");
    if (value) {
      workspaces.push(value);
    }
  }
}

let stripped = 0;

for (const workspace of workspaces) {
  const pkgPath = resolve(rootDir, workspace, "package.json");
  let content: string;
  try {
    content = await fsp.readFile(pkgPath, "utf-8");
  } catch {
    continue;
  }

  const pkg = JSON.parse(content);
  if (!pkg.exports) continue;

  let modified = false;
  for (const value of Object.values(pkg.exports)) {
    if (
      typeof value === "object" &&
      value !== null &&
      "development" in value
    ) {
      delete (value as Record<string, unknown>).development;
      modified = true;
    }
  }

  if (modified) {
    await fsp.writeFile(pkgPath, JSON.stringify(pkg, null, 2) + "\n");
    stripped++;
    console.log(`Stripped development exports from ${workspace}/package.json`);
  }
}

console.log(`Done: stripped ${stripped} package(s)`);
