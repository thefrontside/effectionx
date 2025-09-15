import { build, emptyDir } from "@deno/dnt";
import { join } from "@std/path";

import { DenoJson } from "./lib/read-packages.ts";

let [workspace] = Deno.args;
if (!workspace) {
  throw new Error("workspace path is required build npm package");
}

Deno.chdir(workspace);

let mod = await import(join(Deno.cwd(), `/deno.json`), {
  with: { type: "json" },
});

let deno = DenoJson.parse(mod.default);

let entryPoints = typeof deno.exports === "string"
  ? [deno.exports]
  : Object.entries(deno.exports).map(([name, path]) => ({
    kind: "export" as const,
    name,
    path,
  }));

const outDir = "./build/npm";

await emptyDir(outDir);

await build({
  entryPoints,
  outDir,
  shims: {
    deno: false,
  },
  test: false,
  typeCheck: false,
  package: {
    // package.json properties
    name: deno.name,
    version: deno.version!,
    license: deno.license,
    author: "engineering@frontside.com",
    repository: {
      type: "git",
      url: "git+https://github.com/thefrontside/effectionx.git",
    },
    bugs: {
      url: "https://github.com/thefrontside/effectionx/issues",
    },
    engines: {
      node: ">= 16",
    },
    sideEffects: false,
  },
});

await Deno.copyFile(`README.md`, `${outDir}/README.md`);
