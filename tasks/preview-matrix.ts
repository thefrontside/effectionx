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

  let workspaces: string[] = [];

  for (let pkg of packages) {
    // Check if any changed file is within this package's workspace
    let hasChanges = changedFiles.some((file) =>
      file.startsWith(`${pkg.workspace}/`)
    );

    if (hasChanges) {
      workspaces.push(pkg.workspace);
    }
  }

  let outputValue = `workspaces=${workspaces.join(" ")}`;

  console.log(outputValue);

  if (Deno.env.has("GITHUB_OUTPUT")) {
    const githubOutput = Deno.env.get("GITHUB_OUTPUT") as string;
    yield* until(
      Deno.writeTextFile(githubOutput, outputValue, {
        append: true,
      }),
    );
  }
});
