import * as path from "node:path";
import {
  createSignal,
  type Operation,
  resource,
  spawn,
  type Stream,
} from "effection";

import { FsApi, toPath } from "./api.ts";

export * from "./api.ts";

export const {
  cwd,
  stat,
  lstat,
  readdir,
  rm,
  copyFile,
  readTextFile,
  writeTextFile,
  exists,
  ensureDir,
  ensureFile,
  emptyDir,
} = FsApi.operations;

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

      const entries = yield* FsApi.operations.readdirDirents(dir);

      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);

        let isSymlink = entry.isSymbolicLink();
        let isDirectory = entry.isDirectory();
        let isFile = entry.isFile();

        // If following symlinks, resolve the target type
        if (isSymlink && followSymlinks) {
          try {
            const stats = yield* FsApi.operations.stat(fullPath);
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
