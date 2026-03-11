/**
 * Durable read file — persistent, replay-safe file read with content hash.
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

export interface ReadFileResult {
  content: string;
  contentHash: string;
}

/**
 * Read a file durably.
 *
 * Path in description, content + SHA-256 hash in result.
 * Designed for replay guard integration.
 *
 * Note: `encoding` is recorded in the description for future use but
 * the current `DurableRuntime.readTextFile` always reads as UTF-8.
 * Non-default encodings will require a runtime interface extension.
 */
export function* durableReadFile(
  name: string,
  path: string,
  options?: { encoding?: string },
): Workflow<ReadFileResult> {
  const encoding = options?.encoding ?? "utf-8";

  return (yield createDurableOperation<Json>(
    { type: "read_file", name, path, encoding },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const content = yield* runtime.readTextFile(path);
      const contentHash = yield* computeSHA256(content);
      return { content, contentHash } as unknown as Json;
    },
  )) as ReadFileResult;
}
