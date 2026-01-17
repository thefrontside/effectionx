import { call, main } from "effection";
import { promises as fsp } from "node:fs";
import process from "node:process";
import { x } from "@effectionx/tinyexec";
import { readPackages } from "./lib/read-packages.ts";

await main(function* () {
  const packages = yield* readPackages();

  const npmInclude: Record<string, unknown>[] = [];

  for (const pkg of packages) {
    const tagname = `${pkg.name.split("/")[1]}-v${pkg.version}`;

    const git = yield* x(`git`, [`tag`, `--list`, tagname]);
    const { stdout } = yield* git;

    // if tag doesn't exist, check npm registry
    if (stdout.trim() === "") {
      const pkgInfo = {
        workspace: pkg.workspace,
        tagname,
        name: pkg.name,
        version: pkg.version,
      };

      // Check NPM registry
      const npmCheck = yield* x(`npm`, [`view`, `${pkg.name}@${pkg.version}`], {
        throwOnError: false,
      });
      const npmOutput = yield* npmCheck;
      if (npmOutput.exitCode !== 0) {
        npmInclude.push(pkgInfo);
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
      fsp.appendFile(process.env.GITHUB_OUTPUT as string, outputValue + "\n")
    );
  }
});
