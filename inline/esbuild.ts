/**
 * esbuild plugin that applies the {@link @effectionx/inline} optimization
 * at build time. Transforms all `yield*` expressions inside generator
 * functions into `(yield inline(...))` calls.
 *
 * @example
 * ```ts
 * import { build } from "esbuild";
 * import { inlinePlugin } from "@effectionx/inline/esbuild";
 *
 * await build({
 *   entryPoints: ["src/index.ts"],
 *   bundle: true,
 *   plugins: [inlinePlugin()],
 * });
 * ```
 *
 * @module
 */

import type { Plugin } from "esbuild";
import { readFile } from "node:fs/promises";
import { transformSource } from "./transform.ts";

export function inlinePlugin(): Plugin {
  return {
    name: "effectionx-inline",
    setup(build) {
      build.onLoad({ filter: /\.[tj]sx?$/ }, async (args) => {
        let source = await readFile(args.path, "utf-8");
        let { code, transformed } = transformSource(source, args.path);

        if (!transformed) {
          return undefined;
        }

        let loader = args.path.endsWith(".tsx")
          ? ("tsx" as const)
          : args.path.endsWith(".ts")
            ? ("ts" as const)
            : args.path.endsWith(".jsx")
              ? ("jsx" as const)
              : ("js" as const);

        return { contents: code, loader };
      });
    },
  };
}
