import { call, main } from "effection";
import { promises as fsp } from "node:fs";
import process from "node:process";
import { x } from "@effectionx/tinyexec";
import { readPackages } from "./lib/read-packages.ts";

await main(function* () {
  const packages = yield* readPackages();

  // Get the base branch from GitHub Actions environment
  const baseBranch = process.env.GITHUB_BASE_REF || "main";

  // Get list of changed files compared to base branch
  const git = yield* x("git", ["diff", "--name-only", `origin/${baseBranch}...HEAD`]);
  const { stdout } = yield* git;
  const changedFiles = stdout.trim().split("\n").filter(Boolean);

  const workspaces: string[] = [];

  for (const pkg of packages) {
    // Check if any changed file is within this package's workspace
    const hasChanges = changedFiles.some((file) =>
      file.startsWith(`${pkg.workspace}/`)
    );

    if (hasChanges) {
      workspaces.push(pkg.workspace);
    }
  }

  const outputValue = `workspaces=${workspaces.join(" ")}`;

  console.log(outputValue);

  if (process.env.GITHUB_OUTPUT) {
    yield* call(() =>
      fsp.appendFile(process.env.GITHUB_OUTPUT as string, outputValue + "\n")
    );
  }
});
