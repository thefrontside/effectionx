import type { Dirent, Stats } from "node:fs";
import * as fsp from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { type Api, createApi } from "@effectionx/context-api";
import { type Operation, until } from "effection";

/**
 * Convert a path or URL to a file path string
 */
export function toPath(pathOrUrl: string | URL): string {
  return pathOrUrl instanceof URL ? fileURLToPath(pathOrUrl) : pathOrUrl;
}

/**
 * Core interface for the file system API operations.
 * Used internally by createApi to enable middleware support.
 */
export interface FsApiCore {
  /**
   * Get file or directory stats.
   */
  stat(pathOrUrl: string | URL): Operation<Stats>;
  /**
   * Get file or directory stats without following symlinks.
   */
  lstat(pathOrUrl: string | URL): Operation<Stats>;
  /**
   * Read a file as text.
   */
  readTextFile(pathOrUrl: string | URL): Operation<string>;
  /**
   * Write text to a file.
   */
  writeTextFile(pathOrUrl: string | URL, content: string): Operation<void>;
  /**
   * Remove a file or directory.
   */
  rm(
    pathOrUrl: string | URL,
    options?: { recursive?: boolean; force?: boolean },
  ): Operation<void>;
  /**
   * Read directory entries as Dirent objects.
   */
  readdir(pathOrUrl: string | URL): Operation<Dirent[]>;
}

/**
 * The file system API object that supports middleware decoration.
 *
 * Use `FsApi.around()` to add middleware for logging, mocking, or instrumentation.
 *
 * @example
 * ```ts
 * import { FsApi, readTextFile } from "@effectionx/fs";
 * import { run } from "effection";
 *
 * await run(function*() {
 *   // Add logging middleware
 *   yield* FsApi.around({
 *     *readTextFile(args, next) {
 *       let [pathOrUrl] = args;
 *       console.log("Reading file:", pathOrUrl);
 *       return yield* next(...args);
 *     }
 *   });
 *
 *   // All readTextFile calls in this scope now log
 *   let content = yield* readTextFile("./config.json");
 * });
 * ```
 *
 * @example
 * ```ts
 * // Mock file system for testing
 * await run(function*() {
 *   yield* FsApi.around({
 *     *readTextFile(args, next) {
 *       let [pathOrUrl] = args;
 *       if (String(pathOrUrl).includes("config.json")) {
 *         return JSON.stringify({ mock: true });
 *       }
 *       return yield* next(...args);
 *     }
 *   });
 *
 *   // Returns mocked content in this scope
 *   let config = yield* readTextFile("./config.json");
 * });
 * ```
 */
export const FsApi: Api<FsApiCore> = createApi("fs", {
  *stat(pathOrUrl: string | URL): Operation<Stats> {
    return yield* until(fsp.stat(toPath(pathOrUrl)));
  },
  *lstat(pathOrUrl: string | URL): Operation<Stats> {
    return yield* until(fsp.lstat(toPath(pathOrUrl)));
  },
  *readTextFile(pathOrUrl: string | URL): Operation<string> {
    return yield* until(fsp.readFile(toPath(pathOrUrl), "utf-8"));
  },
  *writeTextFile(pathOrUrl: string | URL, content: string): Operation<void> {
    return yield* until(fsp.writeFile(toPath(pathOrUrl), content));
  },
  *rm(
    pathOrUrl: string | URL,
    options?: { recursive?: boolean; force?: boolean },
  ): Operation<void> {
    return yield* until(fsp.rm(toPath(pathOrUrl), options));
  },
  *readdir(pathOrUrl: string | URL): Operation<Dirent[]> {
    return yield* until(
      fsp.readdir(toPath(pathOrUrl), { withFileTypes: true }),
    );
  },
});

/**
 * Get file or directory stats.
 *
 * This function supports middleware via {@link FsApi}. Use `FsApi.around()`
 * to add logging, mocking, or other middleware.
 *
 * @example
 * ```ts
 * import { stat } from "@effectionx/fs";
 *
 * const stats = yield* stat("./file.txt");
 * console.log(stats.isFile());
 * ```
 */
export const stat = FsApi.operations.stat;

/**
 * Get file or directory stats without following symlinks.
 *
 * This function supports middleware via {@link FsApi}. Use `FsApi.around()`
 * to add logging, mocking, or other middleware.
 *
 * @example
 * ```ts
 * import { lstat } from "@effectionx/fs";
 *
 * const stats = yield* lstat("./symlink");
 * console.log(stats.isSymbolicLink());
 * ```
 */
export const lstat = FsApi.operations.lstat;

/**
 * Read a file as text.
 *
 * This function supports middleware via {@link FsApi}. Use `FsApi.around()`
 * to add logging, mocking, or other middleware.
 *
 * @example
 * ```ts
 * import { readTextFile } from "@effectionx/fs";
 *
 * const content = yield* readTextFile("./config.json");
 * ```
 */
export const readTextFile = FsApi.operations.readTextFile;

/**
 * Write text to a file.
 *
 * This function supports middleware via {@link FsApi}. Use `FsApi.around()`
 * to add logging, mocking, or other middleware.
 *
 * @example
 * ```ts
 * import { writeTextFile } from "@effectionx/fs";
 *
 * yield* writeTextFile("./output.txt", "Hello, World!");
 * ```
 */
export const writeTextFile = FsApi.operations.writeTextFile;

/**
 * Remove a file or directory.
 *
 * This function supports middleware via {@link FsApi}. Use `FsApi.around()`
 * to add logging, mocking, or other middleware.
 *
 * @example
 * ```ts
 * import { rm } from "@effectionx/fs";
 *
 * yield* rm("./temp", { recursive: true });
 * ```
 */
export const rm = FsApi.operations.rm;

/**
 * Read directory entries as Dirent objects.
 *
 * This is the core readdir operation used internally. For the public API
 * with overloads (returning `string[]` by default or `Dirent[]` with
 * `{ withFileTypes: true }`), use the `readdir` function from the main
 * module entry point.
 */
export const readdirDirents = FsApi.operations.readdir;
