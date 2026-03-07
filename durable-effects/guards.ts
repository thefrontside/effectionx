/**
 * Replay guards — pluggable validation for durable effect staleness detection.
 *
 * Guards install middleware on the ReplayGuard API that runs in two phases:
 *
 * 1. **check** (before replay begins): I/O allowed. Gather current state
 *    (hash files, scan directories, compute hashes) and cache results.
 *
 * 2. **decide** (during replay): Synchronous, pure. Compare cached current
 *    state against recorded state in the journal. Return error if stale.
 *
 * All I/O goes through DurableRuntime (Operation-native).
 * All hashing goes through computeSHA256 (Operation-native).
 */

import {
  type Json,
  ReplayGuard,
  type ReplayOutcome,
  StaleInputError,
} from "@effectionx/durable-streams";
import { useScope } from "effection";
import type { Operation } from "effection";
import { computeSHA256 } from "./hash.ts";
import { type DurableRuntime, DurableRuntimeCtx } from "./runtime.ts";

// ---------------------------------------------------------------------------
// Guard 1: useFileContentGuard — file staleness detection
// ---------------------------------------------------------------------------

/**
 * Install a file content replay guard on the current scope.
 *
 * Works with `durableReadFile` effects. Detects when a file referenced by
 * a `read_file` effect has changed since the journal was recorded.
 *
 * - **Check**: reads `event.description.path`, calls `runtime.readTextFile()`
 *   + `computeSHA256()` to get the current hash. Caches by path (dedup).
 * - **Decide**: reads `event.result.value.contentHash` (recorded hash),
 *   compares against cached current hash. Mismatch → `StaleInputError`.
 * - **No opinion**: if no `path` in description or no `contentHash` in
 *   result, calls `next(event)`.
 */
export function* useFileContentGuard(): Operation<void> {
  const scope = yield* useScope();
  const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);
  const cache = new Map<string, string>();

  scope.around(ReplayGuard, {
    *check([event], next): Operation<void> {
      const filePath = event.description.path;
      if (typeof filePath === "string" && !cache.has(filePath)) {
        const content = yield* runtime.readTextFile(filePath);
        const currentHash = yield* computeSHA256(content);
        cache.set(filePath, currentHash);
      }
      return yield* next(event);
    },
    decide([event], next): ReplayOutcome {
      const filePath = event.description.path;
      const resultValue =
        event.result.status === "ok" ? event.result.value : undefined;
      const recordedHash = (resultValue as Record<string, unknown> | undefined)
        ?.contentHash as string | undefined;

      if (typeof filePath === "string" && typeof recordedHash === "string") {
        const currentHash = cache.get(filePath);
        if (currentHash && currentHash !== recordedHash) {
          return {
            outcome: "error",
            error: new StaleInputError(
              `File changed: ${filePath} (recorded: ${recordedHash.slice(0, 16)}…, ` +
                `current: ${currentHash.slice(0, 16)}…)`,
            ),
          };
        }
      }
      return next(event);
    },
  });
}

// ---------------------------------------------------------------------------
// Guard 2: useGlobContentGuard — directory scan staleness detection
// ---------------------------------------------------------------------------

/**
 * Install a glob content replay guard on the current scope.
 *
 * Works with `durableGlob` effects. Detects when the file set matching
 * a glob pattern has changed (files added, removed, or modified).
 *
 * - **Check**: reads `event.description.baseDir`, `include`, `exclude`.
 *   Calls `runtime.glob()` + hashes each file + computes composite scanHash.
 *   Caches keyed by `baseDir|include|exclude`.
 * - **Decide**: reads `event.result.value.scanHash`, compares against
 *   cached current scanHash. Mismatch → `StaleInputError`.
 * - **No opinion**: if event type is not `"glob"`, calls `next(event)`.
 */
export function* useGlobContentGuard(): Operation<void> {
  const scope = yield* useScope();
  const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);
  const cache = new Map<string, string>();

  scope.around(ReplayGuard, {
    *check([event], next): Operation<void> {
      if (event.description.type === "glob") {
        const baseDir = event.description.baseDir as string;
        const include = event.description.include as string[];
        const exclude = (event.description.exclude ?? []) as string[];
        const key = `${baseDir}|${JSON.stringify(include)}|${JSON.stringify(exclude)}`;

        if (!cache.has(key)) {
          const entries = yield* runtime.glob({
            patterns: include,
            root: baseDir,
            exclude,
          });
          const matches: Array<{ path: string; contentHash: string }> = [];
          for (const entry of entries) {
            if (!entry.isFile) continue;
            const content = yield* runtime.readTextFile(
              `${baseDir}/${entry.path}`,
            );
            const contentHash = yield* computeSHA256(content);
            matches.push({ path: entry.path, contentHash });
          }
          matches.sort((a, b) => a.path.localeCompare(b.path));
          const seen = new Set<string>();
          const deduped = matches.filter((m) => {
            if (seen.has(m.path)) return false;
            seen.add(m.path);
            return true;
          });
          const scanHash = yield* computeSHA256(JSON.stringify(deduped));
          cache.set(key, scanHash);
        }
      }
      return yield* next(event);
    },
    decide([event], next): ReplayOutcome {
      if (event.description.type === "glob") {
        const baseDir = event.description.baseDir as string;
        const include = event.description.include as string[];
        const exclude = (event.description.exclude ?? []) as string[];
        const key = `${baseDir}|${JSON.stringify(include)}|${JSON.stringify(exclude)}`;

        const currentHash = cache.get(key);
        const recordedHash = (
          event.result.status === "ok"
            ? (event.result.value as Record<string, unknown>)?.scanHash
            : undefined
        ) as string | undefined;

        if (currentHash && recordedHash && currentHash !== recordedHash) {
          return {
            outcome: "error",
            error: new StaleInputError(`Glob results changed for ${baseDir}`),
          };
        }
      }
      return next(event);
    },
  });
}

// ---------------------------------------------------------------------------
// Guard 3: useCodeFreshnessGuard — eval source/bindings staleness
// ---------------------------------------------------------------------------

/**
 * Source and bindings for an eval cell.
 *
 * Provided by the caller's lookup function to the code freshness guard.
 */
export interface CellSource {
  source: string;
  bindings: Record<string, Json>;
}

/**
 * Install a code freshness replay guard on the current scope.
 *
 * Works with `durableEval` effects. Detects when the source code or
 * bindings for an eval cell have changed.
 *
 * Unlike file/glob guards, this guard needs external input — the current
 * source and bindings for each cell name. The guard takes a lookup
 * function that maps cell names to their current source and bindings.
 *
 * - **Check**: for each `eval` event, looks up current source/bindings
 *   by `event.description.name`, computes `sourceHash` and `bindingsHash`.
 * - **Decide**: reads recorded `sourceHash`/`bindingsHash` from result,
 *   compares against cached current hashes. Either mismatch → `StaleInputError`.
 * - **No opinion**: if event type is not `"eval"` or cell name unknown,
 *   calls `next(event)`.
 */
export function* useCodeFreshnessGuard(
  getCellSource: (cellName: string) => CellSource | undefined,
): Operation<void> {
  const scope = yield* useScope();
  const cache = new Map<string, { sourceHash: string; bindingsHash: string }>();

  scope.around(ReplayGuard, {
    *check([event], next): Operation<void> {
      if (event.description.type === "eval") {
        const cellName = event.description.name;
        if (!cache.has(cellName)) {
          const cell = getCellSource(cellName);
          if (cell) {
            const sourceHash = yield* computeSHA256(cell.source);
            const bindingsHash = yield* computeSHA256(
              JSON.stringify(cell.bindings),
            );
            cache.set(cellName, { sourceHash, bindingsHash });
          }
        }
      }
      return yield* next(event);
    },
    decide([event], next): ReplayOutcome {
      if (event.description.type === "eval") {
        const cellName = event.description.name;
        const current = cache.get(cellName);
        const recorded =
          event.result.status === "ok"
            ? (event.result.value as Record<string, unknown>)
            : undefined;

        if (current && recorded) {
          if (current.sourceHash !== recorded.sourceHash) {
            return {
              outcome: "error",
              error: new StaleInputError(
                `Source changed for cell "${cellName}"`,
              ),
            };
          }
          if (current.bindingsHash !== recorded.bindingsHash) {
            return {
              outcome: "error",
              error: new StaleInputError(
                `Bindings changed for cell "${cellName}"`,
              ),
            };
          }
        }
      }
      return next(event);
    },
  });
}
