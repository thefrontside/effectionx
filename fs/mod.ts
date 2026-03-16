import type { Dirent } from "node:fs";
export type { Dirent } from "node:fs";
import * as fsp from "node:fs/promises";
import * as path from "node:path";
import {
  type Operation,
  type Stream,
  all,
  createSignal,
  resource,
  spawn,
  until,
} from "effection";

export * from "./api.ts";
import { readdirDirents, rm, stat, toPath } from "./api.ts";

/**
 * Check if a file or directory exists
 *
 * @example
 * ```ts
 * import { exists } from "@effectionx/fs";
 *
 * if (yield* exists("./config.json")) {
 *   console.log("Config file found");
 * }
 * ```
 */
export function* exists(pathOrUrl: string | URL): Operation<boolean> {
  try {
    yield* until(fsp.access(toPath(pathOrUrl)));
    return true;
  } catch {
    return false;
  }
}

/**
 * Ensure a directory exists, creating it recursively if needed
 *
 * @example
 * ```ts
 * import { ensureDir } from "@effectionx/fs";
 *
 * yield* ensureDir("./data/cache");
 * ```
 */
export function* ensureDir(pathOrUrl: string | URL): Operation<void> {
  yield* until(fsp.mkdir(toPath(pathOrUrl), { recursive: true }));
}

/**
 * Ensure a file exists, creating parent directories and the file if needed
 *
 * @example
 * ```ts
 * import { ensureFile } from "@effectionx/fs";
 *
 * yield* ensureFile("./data/config.json");
 * ```
 */
export function* ensureFile(pathOrUrl: string | URL): Operation<void> {
  const filePath = toPath(pathOrUrl);
  try {
    yield* until(fsp.access(filePath));
  } catch {
    yield* until(fsp.mkdir(path.dirname(filePath), { recursive: true }));
    yield* until(fsp.writeFile(filePath, ""));
  }
}

/**
 * Read the contents of a directory.
 *
 * Returns filenames as strings by default. Pass `{ withFileTypes: true }` to
 * get `Dirent` objects with file type information, mirroring the `fs/promises`
 * API.
 *
 * This function supports middleware via {@link FsApi}. Use `FsApi.around()`
 * to add logging, mocking, or other middleware.
 *
 * @example
 * ```ts
 * import { readdir } from "@effectionx/fs";
 *
 * // Get filenames
 * const names = yield* readdir("./src");
 *
 * // Get Dirent objects with file type info
 * const entries = yield* readdir("./src", { withFileTypes: true });
 * for (const entry of entries) {
 *   if (entry.isFile()) console.log(entry.name);
 * }
 * ```
 */
export function readdir(pathOrUrl: string | URL): Operation<string[]>;
export function readdir(
  pathOrUrl: string | URL,
  options: { withFileTypes: true },
): Operation<Dirent[]>;
export function readdir(
  pathOrUrl: string | URL,
  options?: { withFileTypes?: boolean },
): Operation<string[]> | Operation<Dirent[]> {
  if (options?.withFileTypes) {
    return readdirDirents(pathOrUrl);
  }
  return {
    *[Symbol.iterator]() {
      const entries = yield* readdirDirents(pathOrUrl);
      return entries.map((e) => e.name);
    },
  };
}

/**
 * Empty a directory by removing all its contents.
 * Creates the directory if it doesn't exist.
 *
 * @example
 * ```ts
 * import { emptyDir } from "@effectionx/fs";
 *
 * yield* emptyDir("./dist");
 * ```
 */
export function* emptyDir(pathOrUrl: string | URL): Operation<void> {
  const dirPath = toPath(pathOrUrl);

  try {
    const entries = yield* readdir(dirPath);
    yield* all(
      entries.map((entry) =>
        rm(path.join(dirPath, entry), { recursive: true, force: true }),
      ),
    );
  } catch (error) {
    // If directory doesn't exist, create it
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      yield* until(fsp.mkdir(dirPath, { recursive: true }));
    } else {
      throw error;
    }
  }
}

/**
 * Copy a file
 *
 * @example
 * ```ts
 * import { copyFile } from "@effectionx/fs";
 *
 * yield* copyFile("./source.txt", "./dest.txt");
 * ```
 */
export function copyFile(
  src: string | URL,
  dest: string | URL,
): Operation<void> {
  return until(fsp.copyFile(toPath(src), toPath(dest)));
}

/**
 * Entry returned by walk()
 */
export interface WalkEntry {
  /** Full path to the entry */
  path: string;
  /** Name of the entry (basename) */
  name: string;
  /** Whether the entry is a file */
  isFile: boolean;
  /** Whether the entry is a directory */
  isDirectory: boolean;
  /** Whether the entry is a symbolic link */
  isSymlink: boolean;
}

/**
 * Options for walk()
 */
export interface WalkOptions {
  /** Include directories in results (default: true) */
  includeDirs?: boolean;
  /** Include files in results (default: true) */
  includeFiles?: boolean;
  /** Include symbolic links in results (default: true) */
  includeSymlinks?: boolean;
  /** Only include entries matching these patterns */
  match?: RegExp[];
  /** Exclude entries matching these patterns */
  skip?: RegExp[];
  /** Maximum depth to traverse (default: Infinity) */
  maxDepth?: number;
  /** Follow symbolic links (default: false) */
  followSymlinks?: boolean;
}

/**
 * Walk a directory tree and yield entries as a Stream
 *
 * @example
 * ```ts
 * import { walk } from "@effectionx/fs";
 * import { each } from "effection";
 *
 * for (const entry of yield* each(walk("./src"))) {
 *   if (entry.isFile && entry.name.endsWith(".ts")) {
 *     console.log(entry.path);
 *   }
 *   yield* each.next();
 * }
 * ```
 */
export function walk(
  root: string | URL,
  options: WalkOptions = {},
): Stream<WalkEntry, void> {
  const {
    includeDirs = true,
    includeFiles = true,
    includeSymlinks = true,
    match,
    skip,
    maxDepth = Number.POSITIVE_INFINITY,
    followSymlinks = false,
  } = options;

  const rootPath = toPath(root);

  function shouldInclude(entry: WalkEntry): boolean {
    if (skip?.some((re) => re.test(entry.path))) {
      return false;
    }
    if (match && !match.some((re) => re.test(entry.path))) {
      return false;
    }
    return true;
  }

  return resource(function* (provide) {
    const signal = createSignal<WalkEntry, void>();

    function* walkDir(dir: string, depth: number): Operation<void> {
      if (depth > maxDepth) return;

      const entries = yield* readdirDirents(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        let isSymlink = entry.isSymbolicLink();
        let isDirectory = entry.isDirectory();
        let isFile = entry.isFile();

        // If following symlinks, resolve the target type
        if (isSymlink && followSymlinks) {
          try {
            const stats = yield* stat(fullPath);
            isDirectory = stats.isDirectory();
            isFile = stats.isFile();
          } catch {
            // Broken symlink, skip
            continue;
          }
        }

        const walkEntry: WalkEntry = {
          path: fullPath,
          name: entry.name,
          isFile,
          isDirectory,
          isSymlink,
        };

        if (isDirectory) {
          if (includeDirs && shouldInclude(walkEntry)) {
            signal.send(walkEntry);
          }
          yield* walkDir(fullPath, depth + 1);
        } else if (isSymlink) {
          if (includeSymlinks && shouldInclude(walkEntry)) {
            signal.send(walkEntry);
          }
        } else if (isFile) {
          if (includeFiles && shouldInclude(walkEntry)) {
            signal.send(walkEntry);
          }
        }
      }
    }

    yield* spawn(function* () {
      yield* walkDir(rootPath, 0);
      signal.close();
    });

    yield* provide(yield* signal);
  });
}

/**
 * Expand glob patterns and yield matching paths as a Stream
 *
 * @example
 * ```ts
 * import { expandGlob } from "@effectionx/fs";
 * import { each } from "effection";
 *
 * for (const entry of yield* each(expandGlob("./src/*.ts"))) {
 *   console.log(entry.path);
 *   yield* each.next();
 * }
 * ```
 */
export function expandGlob(
  glob: string,
  options: {
    root?: string;
    exclude?: string[];
    includeDirs?: boolean;
    followSymlinks?: boolean;
  } = {},
): Stream<WalkEntry, void> {
  const {
    root = ".",
    exclude = [],
    includeDirs = true,
    followSymlinks = false,
  } = options;

  // Convert glob to regex
  const globRegex = globToRegExp(glob, { extended: true, globstar: true });
  const excludeRegexes = exclude.map((e) =>
    globToRegExp(e, { extended: true, globstar: true }),
  );

  return walk(root, {
    includeDirs,
    includeFiles: true,
    followSymlinks,
    match: [globRegex],
    skip: excludeRegexes,
  });
}

/**
 * Convert a glob pattern to a RegExp
 *
 * @example
 * ```ts
 * import { globToRegExp } from "@effectionx/fs";
 *
 * const regex = globToRegExp("*.ts");
 * console.log(regex.test("file.ts")); // true
 * ```
 */
export function globToRegExp(
  glob: string,
  options?: { extended?: boolean; globstar?: boolean },
): RegExp {
  const { extended = true, globstar = true } = options ?? {};

  let pattern = "";
  let inGroup = false;

  for (let i = 0; i < glob.length; i++) {
    const c = glob[i];
    const next = glob[i + 1];

    switch (c) {
      case "/":
      case "$":
      case "^":
      case "+":
      case ".":
      case "(":
      case ")":
      case "=":
      case "!":
      case "|":
        pattern += `\\${c}`;
        break;

      case "?":
        if (extended) {
          pattern += ".";
        } else {
          pattern += "\\?";
        }
        break;

      case "[":
      case "]":
        if (extended) {
          pattern += c;
        } else {
          pattern += `\\${c}`;
        }
        break;

      case "{":
        if (extended) {
          inGroup = true;
          pattern += "(";
        } else {
          pattern += "\\{";
        }
        break;

      case "}":
        if (extended) {
          inGroup = false;
          pattern += ")";
        } else {
          pattern += "\\}";
        }
        break;

      case ",":
        if (inGroup) {
          pattern += "|";
        } else {
          pattern += "\\,";
        }
        break;

      case "*":
        if (globstar && next === "*") {
          // **
          i++; // skip next *
          const prevChar = glob[i - 2];
          const nextChar = glob[i + 1];

          if (
            (prevChar === undefined || prevChar === "/") &&
            (nextChar === undefined || nextChar === "/")
          ) {
            // Match any path segment
            pattern += "(?:[^/]*(?:/|$))*";
            if (nextChar === "/") i++; // skip trailing /
          } else {
            // ** not at segment boundary, treat as *
            pattern += ".*";
          }
        } else {
          // Single *
          pattern += "[^/]*";
        }
        break;

      case "\\":
        // Escape next character
        if (next) {
          pattern += `\\${next}`;
          i++;
        }
        break;

      default:
        pattern += c;
    }
  }

  return new RegExp(`^${pattern}$`);
}

// Re-export URL utilities for convenience
export {
  fileURLToPath as fromFileUrl,
  pathToFileURL as toFileUrl,
} from "node:url";
