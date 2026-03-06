/**
 * Protocol types for the two-event durable execution protocol.
 *
 * Protocol types (Json, Result, DurableEvent, etc.) are the fixed contract
 * defined by protocol-specification.md and do not depend on Effection.
 *
 * Effection integration types (CoroutineView, DurableEffect, Workflow) are
 * in the second section and bridge the protocol with Effection's runtime.
 */

import type { Result as EffectionResult, Resolve, Scope } from "effection";

/** Any JSON-serializable value. */
export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

/** Serialized error for durable storage. */
export interface SerializedError {
  message: string;
  name?: string;
  stack?: string;
}

/** Result of an effect or coroutine. */
export type Result =
  | { status: "ok"; value?: Json }
  | { status: "err"; error: SerializedError }
  | { status: "cancelled" };

/** Dot-delimited hierarchical coroutine path. See spec §3. */
export type CoroutineId = string;

/**
 * Structured effect identity for divergence detection.
 * See spec §6 for matching rules.
 *
 * Only `type` and `name` are compared during divergence detection.
 * Extra fields beyond `type` and `name` are stored verbatim in the
 * journal but never compared. They exist for runtime use (e.g.,
 * replay guards reading input parameters like file paths).
 */
export interface EffectDescription {
  /** Effect category. E.g., "call", "sleep", "action", "spawn", "resource". */
  type: string;
  /** Stable name within the category. E.g., function name, resource label. */
  name: string;
  /** Extra fields stored verbatim, never compared during divergence detection. */
  [key: string]: Json;
}

/**
 * A Yield event — an effect was executed and resolved.
 * Written after an effect resolves. Records both what was requested
 * (description) and what the outcome was (result). See spec §2.1.
 *
 * Replay guards access `description.*` for input fields (e.g., file path)
 * and `result.value.*` for output fields (e.g., content hash). There is
 * no separate metadata field — inputs belong in the effect description,
 * outputs belong in the result.
 */
export interface Yield {
  type: "yield";
  coroutineId: CoroutineId;
  description: EffectDescription;
  result: Result;
}

/**
 * A Close event — a coroutine reached a terminal state.
 * Written when a coroutine terminates (completed, failed, or cancelled).
 * See spec §2.2.
 */
export interface Close {
  type: "close";
  coroutineId: CoroutineId;
  result: Result;
}

/** The two event types that make up the durable stream. */
export type DurableEvent = Yield | Close;

// ---------------------------------------------------------------------------
// Effection integration types
//
// EffectionResult<T> and Resolve<T> are re-exported from Effection.
// EffectionResult<T> is an alias for Effection's Result<T>, renamed to
// avoid collision with our protocol's Result type.
// ---------------------------------------------------------------------------

/**
 * Effection's internal Result type, re-exported under a distinct name to
 * avoid collision with the protocol's Result type.
 *
 * Effection uses { ok: true, value: T } | { ok: false, error: Error }.
 * The protocol uses { status: "ok" | "err" | "cancelled" }.
 */
export type { EffectionResult, Resolve };

/**
 * View of Effection's Coroutine — the fields we need from enter().
 *
 * The full Coroutine type is internal to Effection (@ignore), but
 * enter() receives it. We need `scope` to read DurableContext and
 * to invoke the Divergence API via Api.invoke(scope, ...).
 */
export interface CoroutineView {
  scope: Scope;
}

/**
 * A DurableEffect extends Effection's Effect interface with a structured
 * `effectDescription` for divergence detection and replay.
 *
 * The `enter()` signature matches Effection's Effect<T> exactly:
 *   enter(resolve: Resolve<Result<T>>, routine: Coroutine):
 *     (resolve: Resolve<Result<void>>) => void
 *
 * DurableEffect<T> is structurally assignable to Effect<T> because it has
 * the same shape plus the extra `effectDescription` field. We use
 * CoroutineView (a narrower type than Coroutine) so that contravariance
 * keeps the assignment valid while documenting our minimal dependency.
 */
export interface DurableEffect<T> {
  /** Human-readable description (for Effection's Effect interface). */
  description: string;
  /** Structured description for divergence detection (spec §6). */
  effectDescription: EffectDescription;
  /** Enter the effect — handles replay/live dispatch internally. */
  enter(
    resolve: Resolve<EffectionResult<T>>,
    routine: CoroutineView,
  ): (resolve: Resolve<EffectionResult<void>>) => void;
}

/**
 * A Workflow is a generator that only yields DurableEffect values.
 *
 * Every Workflow is structurally compatible with Operation<T> because
 * DurableEffect<unknown> extends Effect<unknown> (it has all required fields).
 * TypeScript's covariant yield type means Generator<DurableEffect, T, unknown>
 * is assignable to Iterator<Effect, T, unknown>.
 *
 * Uses Generator (not Iterable) so TypeScript enforces the yield type
 * at compile time — yielding a plain Effect inside a Workflow generator
 * is a type error.
 */
export type Workflow<T> = Generator<DurableEffect<unknown>, T, unknown>;
