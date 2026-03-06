/**
 * @module
 * Durable execution for Effection.
 *
 * Implements the two-event durable execution protocol for generator-based
 * structured concurrency, with Durable Streams as the persistence backend.
 */

// Protocol types
export type {
  Close,
  CoroutineId,
  CoroutineView,
  DurableEffect,
  DurableEvent,
  EffectDescription,
  EffectionResult,
  Json,
  Resolve,
  Result,
  SerializedError,
  Workflow,
  Yield,
} from "./types.ts";

// ReplayIndex
export { ReplayIndex } from "./replay-index.ts";
export type { YieldEntry } from "./replay-index.ts";

// Stream interface
export type { DurableStream } from "./stream.ts";
export { InMemoryStream } from "./stream.ts";

// HTTP-backed stream adapter
export { useHttpDurableStream } from "./http-stream.ts";
export type {
  HttpDurableStreamHandle,
  HttpDurableStreamOptions,
} from "./http-stream.ts";

// Errors
export {
  ContinuePastCloseDivergenceError,
  DivergenceError,
  EarlyReturnDivergenceError,
  StaleInputError,
} from "./errors.ts";

// Divergence API — pluggable policy for replay mismatches (DEC-031)
export { Divergence } from "./divergence.ts";
export type {
  DivergenceDecision,
  DivergenceInfo,
  DivergenceKind,
} from "./divergence.ts";

// ReplayGuard API — pluggable validation for replay staleness detection
export { ReplayGuard } from "./replay-guard.ts";
export type { ReplayOutcome } from "./replay-guard.ts";

// File content replay guard
export { useFileContentGuard } from "./file-guard.ts";

// Context
export { DurableCtx } from "./context.ts";
export type { DurableContext } from "./context.ts";

// Serialization utilities
export {
  deserializeError,
  effectionToProtocol,
  protocolToEffection,
  serializeError,
} from "./serialize.ts";

// Core effect factories
export { createDurableEffect, createDurableOperation } from "./effect.ts";
export type { Executor } from "./effect.ts";

// Workflow-enabled effects
export {
  durableAction,
  durableCall,
  durableSleep,
  versionCheck,
} from "./operations.ts";

// Structured concurrency combinators
export { durableAll, durableRace, durableSpawn } from "./combinators.ts";

// Durable iteration
export { durableEach } from "./each.ts";
export type { DurableSource } from "./each.ts";

// Ephemeral — explicit escape hatch for non-durable Operations in Workflows
export { ephemeral } from "./ephemeral.ts";

// Entry point
export { durableRun } from "./run.ts";
export type { DurableRunOptions } from "./run.ts";
