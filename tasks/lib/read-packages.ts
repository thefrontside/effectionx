import { call, type Operation } from "effection";
import { resolve } from "@std/path";
import { z } from "zod";

export const DenoJson = z.object({
  name: z.string(),
  version: z.string(),
  exports: z.union([z.record(z.string()), z.string()]),
  license: z.string(),
});

export type PackageConfig = {
  workspace: string;
  workspacePath: string;
} & z.infer<typeof DenoJson>;

export function* readPackages(): Operation<PackageConfig[]> {
  const root = yield* call(() =>
    import("../../deno.json", {
      with: { type: "json" },
    })
  );

  console.log(`Found ${root.default.workspace.join(", ")}`);

  const configs: PackageConfig[] = [];
  for (let workspace of root.default.workspace) {
    const workspacePath = resolve(Deno.cwd(), workspace);

    const config = yield* call(() =>
      Deno.readTextFile(`${workspacePath}/deno.json`)
    );

    const denoJson = DenoJson.parse(JSON.parse(config));

    configs.push({
      ...denoJson,
      workspace: workspace.replace("./", ""),
      workspacePath,
    });
  }

  return configs;
}
