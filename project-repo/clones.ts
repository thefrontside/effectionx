import * as path from "node:path";
import { emptyDir, ensureDir, exists } from "@effectionx/fs";
import { exec } from "@effectionx/process";
import { type Operation, createContext } from "effection";

const ClonesContext = createContext<string>("git.clones");

/**
 * Options for initializing clones
 */
export interface CloneOptions {
  /** Clean the directory before initializing (default: true) */
  clean?: boolean;
}

/**
 * Initialize the clones base directory and set the context.
 * This should be called once at the start of your application
 * before using `useClone`.
 *
 * @example
 * ```ts
 * import { initClones, useClone } from "@effectionx/git";
 *
 * yield* initClones("./build/clones");
 * const effectionPath = yield* useClone("thefrontside/effection");
 * ```
 */
export function* initClones(
  basePath: string,
  options: CloneOptions = {},
): Operation<void> {
  const { clean = true } = options;

  if (clean) {
    yield* emptyDir(basePath);
  } else {
    yield* ensureDir(basePath);
  }

  yield* ClonesContext.set(basePath);
}

/**
 * Clone a GitHub repository if it doesn't already exist.
 * The repository will be cloned to the base directory set by `initClones`.
 *
 * @param nameWithOwner - The repository in "owner/repo" format (e.g., "thefrontside/effection")
 * @returns The path to the cloned repository
 *
 * @example
 * ```ts
 * import { initClones, useClone } from "@effectionx/git";
 *
 * yield* initClones("./build/clones");
 *
 * // Clone from GitHub
 * const effectionPath = yield* useClone("thefrontside/effection");
 * console.log(effectionPath); // "./build/clones/thefrontside/effection"
 * ```
 */
export function* useClone(nameWithOwner: string): Operation<string> {
  const basePath = yield* ClonesContext.expect();
  const dirpath = path.resolve(basePath, nameWithOwner);

  if (!(yield* exists(dirpath))) {
    yield* exec(
      `git clone https://github.com/${nameWithOwner} ${dirpath}`,
    ).expect();
  }

  return dirpath;
}
