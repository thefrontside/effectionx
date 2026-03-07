/**
 * Durable eval — persistent, replay-safe in-process code evaluation.
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
import type { Operation } from "effection";
import { canonicalJson } from "./canonical-json.ts";
import { computeSHA256 } from "./hash.ts";

export interface EvalOptions {
  source: string;
  language?: string;
  bindings?: Record<string, Json>;
}

export interface EvalResult {
  value: Json;
  sourceHash: string;
  bindingsHash: string;
}

/**
 * Evaluate code via a caller-provided evaluator durably.
 *
 * Source hash and bindings hash in the result for replay guard
 * freshness detection.
 */
export function* durableEval(
  name: string,
  evaluator: (
    source: string,
    bindings: Record<string, Json>,
  ) => Operation<Json>,
  options: EvalOptions,
): Workflow<EvalResult> {
  const { source, language, bindings = {} } = options;

  return (yield createDurableOperation<Json>(
    { type: "eval", name, ...(language ? { language } : {}) },
    function* () {
      const sourceHash = yield* computeSHA256(source);
      const bindingsHash = yield* computeSHA256(canonicalJson(bindings));
      const value = yield* evaluator(source, bindings);
      return { value, sourceHash, bindingsHash } as unknown as Json;
    },
  )) as EvalResult;
}
