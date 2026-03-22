import { call, main } from "effection";
import { promises as fsp } from "node:fs";
import { resolve } from "node:path";
import { readPackages } from "./lib/read-packages.ts";

await main(function* () {
  const packages = yield* readPackages();

  let stripped = 0;

  for (const pkg of packages) {
    const pkgPath = resolve(pkg.workspacePath, "package.json");
    const content = yield* call(() => fsp.readFile(pkgPath, "utf-8"));

    const json = JSON.parse(content);
    if (!json.exports) continue;

    let modified = false;
    for (const value of Object.values(json.exports)) {
      if (
        typeof value === "object" &&
        value !== null &&
        "development" in value
      ) {
        (value as Record<string, unknown>).development = undefined;
        modified = true;
      }
    }

    if (modified) {
      yield* call(() =>
        fsp.writeFile(pkgPath, `${JSON.stringify(json, null, 2)}\n`),
      );
      stripped++;
      console.log(
        `Stripped development exports from ${pkg.workspace}/package.json`,
      );
    }
  }

  console.log(`Done: stripped ${stripped} package(s)`);
});
