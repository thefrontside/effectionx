import { call, main } from "effection";
import { x } from "../tinyexec/mod.ts";
import { readPackages } from "./lib/read-packages.ts";

await main(function* () {
  let packages = yield* readPackages();

  let jsrInclude: Record<string, unknown>[] = [];
  let npmInclude: Record<string, unknown>[] = [];

  for (let pkg of packages) {
    let tagname = `${pkg.name.split("/")[1]}-v${pkg.version}`;

    let git = yield* x(`git`, [`tag`, `--list`, tagname]);
    let { stdout } = yield* git;

    // if tag doesn't exist, check both registries
    if (stdout.trim() === "") {
      let pkgInfo = {
        workspace: pkg.workspace,
        tagname,
        name: pkg.name,
        version: pkg.version,
      };

      // Check JSR registry
      let jsrCheck = yield* x(`deno`, [`info`, `jsr:${pkg.name}@${pkg.version}`], {
        throwOnError: false,
      });
      let jsrOutput = yield* jsrCheck;
      if (jsrOutput.stderr.includes("not found")) {
        jsrInclude.push(pkgInfo);
      }

      // Check NPM registry
      let npmCheck = yield* x(`npm`, [`view`, `${pkg.name}@${pkg.version}`], {
        throwOnError: false,
      });
      let npmOutput = yield* npmCheck;
      if (npmOutput.exitCode !== 0) {
        npmInclude.push(pkgInfo);
      }
    }
  }

  let jsrExists = jsrInclude.length > 0;
  let npmExists = npmInclude.length > 0;

  if (!jsrExists) {
    jsrInclude.push({ workspace: "nothing" });
  }
  if (!npmExists) {
    npmInclude.push({ workspace: "nothing" });
  }

  let outputValue = [
    `jsr_exists=${jsrExists}`,
    `jsr_matrix=${JSON.stringify({ include: jsrInclude })}`,
    `npm_exists=${npmExists}`,
    `npm_matrix=${JSON.stringify({ include: npmInclude })}`,
  ].join("\n");

  console.log(outputValue);

  if (Deno.env.has("GITHUB_OUTPUT")) {
    const githubOutput = Deno.env.get("GITHUB_OUTPUT") as string;
    yield* call(() =>
      Deno.writeTextFile(githubOutput, outputValue, {
        append: true,
      })
    );
  }
});
