import { call, main } from "effection";
import { promises as fsp } from "node:fs";
import process from "node:process";
import { x } from "@effectionx/tinyexec";
import { readPackages } from "./lib/read-packages.ts";

await main(function* () {
  const packages = yield* readPackages();

  const npmInclude: Record<string, unknown>[] = [];

  for (const pkg of packages) {
    // Skip private packages
    if (pkg.private) {
      continue;
    }

    const tagname = `${pkg.name.split("/")[1]}-v${pkg.version}`;

    const git = yield* x("git", ["tag", "--list", tagname]);
    const { stdout } = yield* git;

    // if tag doesn't exist, check npm registry
    if (stdout.trim() === "") {
      // Check if package exists on npm at all (not just this version)
      const npmExistsCheck = yield* x("npm", ["view", pkg.name], {
        throwOnError: false,
      });
      const npmExistsOutput = yield* npmExistsCheck;
      const firstPublish = npmExistsOutput.exitCode !== 0;

      // Check if this specific version exists
      const npmVersionCheck = yield* x("npm", ["view", `${pkg.name}@${pkg.version}`], {
        throwOnError: false,
      });
      const npmVersionOutput = yield* npmVersionCheck;

      // Only include if this version doesn't exist
      if (npmVersionOutput.exitCode !== 0) {
        npmInclude.push({
          workspace: pkg.workspace,
          tagname,
          name: pkg.name,
          version: pkg.version,
          firstPublish,
        });
      }
    }
  }

  const npmExists = npmInclude.length > 0;

  if (!npmExists) {
    npmInclude.push({ workspace: "nothing" });
  }

  const outputValue = [
    `npm_exists=${npmExists}`,
    `npm_matrix=${JSON.stringify({ include: npmInclude })}`,
  ].join("\n");

  console.log(outputValue);

  if (process.env.GITHUB_OUTPUT) {
    yield* call(() =>
      fsp.appendFile(process.env.GITHUB_OUTPUT as string, `${outputValue}\n`),
    );
  }
});
