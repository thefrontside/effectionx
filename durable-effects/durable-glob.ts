/**
 * Durable glob — persistent, replay-safe directory glob with scan hash.
 *
 * Uses `createDurableOperation` from @effectionx/durable-streams.
 * During live execution, the operation runs and persists a Yield event.
 * During replay, the stored result is returned without executing.
 */

import {
  type Json,
  type Workflow,
  createDurableOperation,
} from "@effectionx/durable-streams";
import { useScope } from "effection";
import { computeSHA256 } from "./hash.ts";
import { type DurableRuntime, DurableRuntimeCtx } from "./runtime.ts";

export interface GlobOptions {
  baseDir: string;
  include: string[];
  exclude?: string[];
}

export interface GlobMatch {
  path: string;
  contentHash: string;
}

export interface GlobResult {
  matches: GlobMatch[];
  scanHash: string;
}

/**
 * Discover files matching patterns durably.
 *
 * Sorted matches with per-file hashes. Composite scanHash for
 * replay guard staleness detection.
 */
export function* durableGlob(
  name: string,
  options: GlobOptions,
): Workflow<GlobResult> {
  const { baseDir, include, exclude = [] } = options;

  return (yield createDurableOperation<Json>(
    {
      type: "glob",
      name,
      baseDir,
      include: include as Json,
      exclude: exclude as Json,
    },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const entries = yield* runtime.glob({
        patterns: include,
        root: baseDir,
        exclude,
      });

      const matches: GlobMatch[] = [];
      for (const entry of entries) {
        if (!entry.isFile) continue;
        const content = yield* runtime.readTextFile(`${baseDir}/${entry.path}`);
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
      return { matches: deduped, scanHash } as unknown as Json;
    },
  )) as GlobResult;
}
