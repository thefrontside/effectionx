import { type Operation, call } from "effection";
import { promises as fsp } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { z } from "zod";

export const PackageJson = z.object({
  name: z.string(),
  version: z.string(),
  license: z.string().optional(),
  private: z.boolean().optional(),
});

export type PackageConfig = {
  workspace: string;
  workspacePath: string;
} & z.infer<typeof PackageJson>;

export function* readPackages(): Operation<PackageConfig[]> {
  const rootDir = process.cwd();

  // Read pnpm-workspace.yaml
  const workspaceYaml = yield* call(() =>
    fsp.readFile(resolve(rootDir, "pnpm-workspace.yaml"), "utf-8"),
  );

  // Parse workspace entries (simple YAML parsing for our format)
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

  console.log(`Found ${workspaces.join(", ")}`);

  const configs: PackageConfig[] = [];
  for (const workspace of workspaces) {
    const workspacePath = resolve(rootDir, workspace);

    const packageJsonContent = yield* call(() =>
      fsp.readFile(`${workspacePath}/package.json`, "utf-8"),
    );
    const packageJson = PackageJson.parse(JSON.parse(packageJsonContent));

    configs.push({
      ...packageJson,
      workspace,
      workspacePath,
    });
  }

  return configs;
}
