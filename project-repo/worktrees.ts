import * as path from "node:path";
import { emptyDir, ensureDir, exists } from "@effectionx/fs";
import { exec } from "@effectionx/process";
import { type Operation, createContext } from "effection";

const WorktreesContext = createContext<string>("git.worktrees");

/**
 * Options for initializing worktrees
 */
export interface WorktreeOptions {
  /** Clean the directory before initializing (default: true) */
  clean?: boolean;
}

/**
 * Initialize the worktrees base directory and set the context.
 * This should be called once at the start of your application
 * before using `useWorktree`.
 *
 * @example
 * ```ts
 * import { initWorktrees, useWorktree } from "@effectionx/git";
 *
 * yield* initWorktrees("./build/worktrees");
 * const v3Path = yield* useWorktree("v3.0.0");
 * ```
 */
export function* initWorktrees(
  basePath: string,
  options: WorktreeOptions = {},
): Operation<void> {
  const { clean = true } = options;

  if (clean) {
    yield* emptyDir(basePath);
  } else {
    yield* ensureDir(basePath);
  }

  yield* WorktreesContext.set(basePath);
}

/**
 * Get or create a git worktree for the specified ref (branch, tag, or commit).
 * The worktree will be created in the base directory set by `initWorktrees`.
 *
 * @example
 * ```ts
 * import { initWorktrees, useWorktree } from "@effectionx/git";
 *
 * yield* initWorktrees("./build/worktrees");
 *
 * // Create worktree for a tag
 * const v3Path = yield* useWorktree("v3.0.0");
 *
 * // Create worktree for a branch
 * const mainPath = yield* useWorktree("main");
 * ```
 */
export function* useWorktree(refname: string): Operation<string> {
  const basePath = yield* WorktreesContext.expect();
  const checkout = path.resolve(basePath, refname);

  if (!(yield* exists(checkout))) {
    yield* exec(`git worktree add --force ${checkout} ${refname}`).expect();
  }

  return checkout;
}
