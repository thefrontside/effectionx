import { main, until } from "effection";
import { exec } from "../process/mod.ts";
import { readPackages } from "./lib/read-packages.ts";

await main(function* () {
  let packages = yield* readPackages();

  // Get the base branch from GitHub Actions environment
  let baseBranch = Deno.env.get("GITHUB_BASE_REF") || "main";

  // Get list of changed files compared to base branch
  let { stdout } = yield* exec(
    `git diff --name-only origin/${baseBranch}...HEAD`,
  ).join();
  let changedFiles = stdout.trim().split("\n").filter(Boolean);

  let include: Record<string, unknown>[] = [];

  for (let pkg of packages) {
    // Check if any changed file is within this package's workspace
    let hasChanges = changedFiles.some((file) =>
      file.startsWith(`${pkg.workspace}/`)
    );

    if (hasChanges) {
      include.push({
        workspace: pkg.workspace,
        name: pkg.name,
        version: pkg.version,
      });
    }
  }

  let exists = include.length > 0;

  if (!exists) {
    include.push({ workspace: "nothing" });
  }

  let outputValue = [
    `exists=${exists}`,
    `matrix=${JSON.stringify({ include })}`,
  ].join("\n");

  console.log(outputValue);

  if (Deno.env.has("GITHUB_OUTPUT")) {
    const githubOutput = Deno.env.get("GITHUB_OUTPUT") as string;
    yield* until(
      Deno.writeTextFile(githubOutput, outputValue, {
        append: true,
      })
    );
  }
});
