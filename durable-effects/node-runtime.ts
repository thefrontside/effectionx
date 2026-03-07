/**
 * nodeRuntime — Node.js implementation of DurableRuntime.
 *
 * Delegates to existing effectionx packages for all I/O:
 * - @effectionx/process for subprocess execution
 * - @effectionx/fetch for HTTP requests
 * - @effectionx/fs for filesystem operations (readTextFile, expandGlob, stat)
 *
 * All operations integrate with Effection's structured concurrency —
 * cancellation flows automatically through scope teardown.
 */

import { relative, sep } from "node:path";
import { fetch as effectionFetch } from "@effectionx/fetch";
import {
  readTextFile as fsReadTextFile,
  stat as fsStat,
  globToRegExp,
  walk,
} from "@effectionx/fs";
import { exec } from "@effectionx/process";
import { each } from "effection";
import type { Operation } from "effection";
import type { DurableRuntime, RuntimeFetchResponse } from "./runtime.ts";

/**
 * Create a DurableRuntime backed by Node.js APIs via effectionx packages.
 *
 * Usage:
 * ```typescript
 * const scope = yield* useScope();
 * scope.set(DurableRuntimeCtx, nodeRuntime());
 * ```
 */
export function nodeRuntime(): DurableRuntime {
  return {
    *exec(options) {
      // timeout is accepted in the interface but not yet supported by
      // @effectionx/process — tracked for future enhancement. Cancellation
      // via Effection scope teardown provides the primary timeout mechanism.
      const { command, cwd, env } = options;
      const [cmd, ...args] = command;

      if (!cmd) {
        throw new Error("exec: command array must not be empty");
      }

      // @effectionx/process exec() takes a command string and options
      const result = yield* exec(cmd, {
        arguments: args,
        cwd,
        env,
      }).join();

      return {
        exitCode: result.code ?? 1,
        stdout: result.stdout,
        stderr: result.stderr,
      };
    },

    *readTextFile(path) {
      return yield* fsReadTextFile(path);
    },

    *stat(path) {
      try {
        const s = yield* fsStat(path);
        return {
          exists: true,
          isFile: s.isFile(),
          isDirectory: s.isDirectory(),
        };
      } catch (err: unknown) {
        if ((err as NodeJS.ErrnoException).code === "ENOENT") {
          return { exists: false, isFile: false, isDirectory: false };
        }
        throw err;
      }
    },

    *glob(options) {
      const { patterns, root, exclude = [] } = options;
      const results: Array<{ path: string; isFile: boolean }> = [];

      // Convert include/exclude patterns to RegExp for matching
      // against relative paths from root
      const includeRegexes = patterns.map((p) =>
        globToRegExp(p, { extended: true, globstar: true }),
      );
      const excludeRegexes = exclude.map((e) =>
        globToRegExp(e, { extended: true, globstar: true }),
      );

      // Walk the directory tree and match relative paths
      const stream = walk(root, {
        includeFiles: true,
        includeDirs: false,
        skip: excludeRegexes.length > 0 ? excludeRegexes : undefined,
      });

      for (const entry of yield* each(stream)) {
        // Normalize to POSIX separators for consistent matching across platforms
        const relPath = relative(root, entry.path).split(sep).join("/");
        const matches = includeRegexes.some((re) => re.test(relPath));
        if (matches) {
          results.push({ path: relPath, isFile: entry.isFile });
        }
        yield* each.next();
      }

      return results;
    },

    *fetch(input, init) {
      const response = yield* effectionFetch(input, {
        method: init?.method,
        headers: init?.headers,
        body: init?.body,
      });

      return {
        status: response.status,
        headers: response.headers,
        *text() {
          return yield* response.text();
        },
      } as RuntimeFetchResponse;
    },

    env: (name) => process.env[name],

    platform: () => ({
      os: process.platform,
      arch: process.arch,
    }),
  };
}
