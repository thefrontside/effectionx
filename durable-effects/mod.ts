/**
 * @module
 * Durable effects and replay guards for Effection workflows.
 *
 * Provides platform-agnostic durable effects (exec, readFile, glob, fetch,
 * eval, resolve) and replay guards for staleness detection, built on
 * @effectionx/durable-streams.
 */

// ---------------------------------------------------------------------------
// Runtime
// ---------------------------------------------------------------------------

export { DurableRuntimeCtx } from "./runtime.ts";
export type {
  DurableRuntime,
  ResponseHeaders,
  RuntimeFetchResponse,
} from "./runtime.ts";

// ---------------------------------------------------------------------------
// Node.js runtime implementation
// ---------------------------------------------------------------------------

export { nodeRuntime } from "./node-runtime.ts";

// ---------------------------------------------------------------------------
// Test stub runtime
// ---------------------------------------------------------------------------

export { stubRuntime } from "./stub-runtime.ts";

// ---------------------------------------------------------------------------
// Hashing
// ---------------------------------------------------------------------------

export { computeSHA256 } from "./hash.ts";

// ---------------------------------------------------------------------------
// Durable effects
// ---------------------------------------------------------------------------

export {
  durableExec,
  durableReadFile,
  durableGlob,
  durableFetch,
  durableEval,
  durableResolve,
  durableNow,
  durableUUID,
  durableEnv,
} from "./operations.ts";

export type {
  ExecOptions,
  ExecResult,
  ReadFileResult,
  GlobOptions,
  GlobMatch,
  GlobResult,
  FetchOptions,
  FetchResult,
  EvalOptions,
  EvalResult,
  ResolveKind,
} from "./operations.ts";

// ---------------------------------------------------------------------------
// Replay guards
// ---------------------------------------------------------------------------

export {
  useFileContentGuard,
  useGlobContentGuard,
  useCodeFreshnessGuard,
} from "./guards.ts";

export type { CellSource } from "./guards.ts";
