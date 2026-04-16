import * as fsp from "node:fs/promises";
import type { Dirent, Stats } from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";
import { type Api, createApi } from "@effectionx/context-api";
import { all, type Operation, until } from "effection";

/**
 * Convert a path or URL to a file path string.
 */
export function toPath(pathOrUrl: string | URL): string {
  return pathOrUrl instanceof URL ? fileURLToPath(pathOrUrl) : pathOrUrl;
}

export interface Fs {
  /**
   * Get the current working directory.
   */
  cwd(): string;
  /**
   * Get file or directory stats.
   */
  stat(pathOrUrl: string | URL): Operation<Stats>;
  /**
   * Get file or directory stats without following symlinks.
   */
  lstat(pathOrUrl: string | URL): Operation<Stats>;
  /**
   * Read the contents of a directory as a list of names.
   */
  readdir(pathOrUrl: string | URL): Operation<string[]>;
  /**
   * Read the contents of a directory as `Dirent` objects.
   */
  readdirDirents(pathOrUrl: string | URL): Operation<Dirent[]>;
  /**
   * Remove a file or directory.
   */
  rm(
    pathOrUrl: string | URL,
    options?: { recursive?: boolean; force?: boolean },
  ): Operation<void>;
  /**
   * Copy a file.
   */
  copyFile(src: string | URL, dest: string | URL): Operation<void>;
  /**
   * Read a file as text.
   */
  readTextFile(pathOrUrl: string | URL): Operation<string>;
  /**
   * Write text to a file.
   */
  writeTextFile(
    pathOrUrl: string | URL,
    content: string,
  ): Operation<void>;
  /**
   * Check if a file or directory exists.
   */
  exists(pathOrUrl: string | URL): Operation<boolean>;
  /**
   * Ensure a directory exists, creating it recursively if needed.
   */
  ensureDir(pathOrUrl: string | URL): Operation<void>;
  /**
   * Ensure a file exists, creating parent directories and the file if needed.
   */
  ensureFile(pathOrUrl: string | URL): Operation<void>;
  /**
   * Empty a directory by removing all its contents.
   * Creates the directory if it doesn't exist.
   */
  emptyDir(pathOrUrl: string | URL): Operation<void>;
}

export const FsApi: Api<Fs> = createApi("@effectionx/fs", {
  cwd() {
    return process.cwd();
  },

  stat(pathOrUrl: string | URL) {
    return until(fsp.stat(toPath(pathOrUrl)));
  },

  lstat(pathOrUrl: string | URL) {
    return until(fsp.lstat(toPath(pathOrUrl)));
  },

  readdir(pathOrUrl: string | URL) {
    return until(fsp.readdir(toPath(pathOrUrl)));
  },

  readdirDirents(pathOrUrl: string | URL) {
    return until(fsp.readdir(toPath(pathOrUrl), { withFileTypes: true }));
  },

  rm(
    pathOrUrl: string | URL,
    options?: { recursive?: boolean; force?: boolean },
  ) {
    return until(fsp.rm(toPath(pathOrUrl), options));
  },

  copyFile(src: string | URL, dest: string | URL) {
    return until(fsp.copyFile(toPath(src), toPath(dest)));
  },

  readTextFile(pathOrUrl: string | URL) {
    return until(fsp.readFile(toPath(pathOrUrl), "utf-8"));
  },

  writeTextFile(pathOrUrl: string | URL, content: string) {
    return until(fsp.writeFile(toPath(pathOrUrl), content));
  },

  *exists(pathOrUrl: string | URL): Operation<boolean> {
    try {
      yield* until(fsp.access(toPath(pathOrUrl)));
      return true;
    } catch {
      return false;
    }
  },

  *ensureDir(pathOrUrl: string | URL): Operation<void> {
    yield* until(fsp.mkdir(toPath(pathOrUrl), { recursive: true }));
  },

  *ensureFile(pathOrUrl: string | URL): Operation<void> {
    const filePath = toPath(pathOrUrl);
    try {
      yield* until(fsp.access(filePath));
    } catch {
      yield* until(fsp.mkdir(path.dirname(filePath), { recursive: true }));
      yield* FsApi.operations.writeTextFile(filePath, "");
    }
  },

  *emptyDir(pathOrUrl: string | URL): Operation<void> {
    const dirPath = toPath(pathOrUrl);
    try {
      const entries = yield* FsApi.operations.readdir(dirPath);
      yield* all(
        entries.map((entry) =>
          FsApi.operations.rm(path.join(dirPath, entry), {
            recursive: true,
            force: true,
          }),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        yield* until(fsp.mkdir(dirPath, { recursive: true }));
      } else {
        throw error;
      }
    }
  },
});
