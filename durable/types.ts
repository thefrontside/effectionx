import type { Operation } from "effection";

// ── JSON-safe types ────────────────────────────────────────────────

export type Json =
  | string
  | number
  | boolean
  | null
  | Json[]
  | { [key: string]: Json };

export interface SerializedError {
  name: string;
  message: string;
  stack?: string;
  cause?: SerializedError;
}

// ── DurableOperation brand ─────────────────────────────────────────
//
// Private symbol — NOT exported. Only package-internal helpers can
// mint a DurableOperation. External code sees the branded type but
// cannot fabricate it from a plain Operation<T>.

declare const durableOperationBrand: unique symbol;

/**
 * A branded {@link Operation} that participates in durable record/replay.
 *
 * `DurableOperation<T>` is structurally an `Operation<T>` (so `yield*`
 * works transparently) but carries a type-level brand that prevents
 * accidental assignment from plain operations.
 *
 * Only the durable runtime and primitive helpers can create instances.
 */
export type DurableOperation<T> = Operation<T> & {
  readonly [durableOperationBrand]: true;
};

/**
 * Cast a plain Operation to a DurableOperation.
 *
 * @internal — only used by durable primitives and the runtime.
 * Not exported from the public API.
 */
export function asDurable<T>(op: Operation<T>): DurableOperation<T> {
  return op as DurableOperation<T>;
}

// ── Durable Event types ────────────────────────────────────────────
//
// 4-event schema for the durable stream protocol.
// Replaces the 8-event schema from @effectionx/durably.

export type DurableEvent = Yield | Next | Close | Spawn;

/**
 * Outbound: coroutine yielded an effect to the outside world.
 */
export interface Yield {
  type: "yield";
  coroutineId: string;
  effectId: string;
  description: string;
}

/**
 * Inbound: outside world responded to a yield.
 */
export interface Next {
  type: "next";
  coroutineId: string;
  effectId: string;
  status: "ok" | "err";
  value?: Json;
  error?: SerializedError;
}

/**
 * Terminal: coroutine reached a final state.
 *
 * Three-way status:
 * - `"ok"` — completed successfully (value is the return value)
 * - `"err"` — failed with an error
 * - `"cancelled"` — halted by parent (intentional cancellation)
 */
export interface Close {
  type: "close";
  coroutineId: string;
  status: "ok" | "err" | "cancelled";
  value?: Json;
  error?: SerializedError;
}

/**
 * Structural: coroutine spawned a child.
 * Emitted before the child begins execution.
 */
export interface Spawn {
  type: "spawn";
  coroutineId: string;
  childCoroutineId: string;
}

// ── Durable Stream interface ───────────────────────────────────────

export interface StreamEntry {
  offset: number;
  event: DurableEvent;
}

/**
 * Append-only, offset-based event stream for durable workflows.
 *
 * All coroutines in a workflow write to a single stream.
 * The stream URL is the workflow identity; the stream offset
 * after the last event is the checkpoint.
 */
export interface DurableStream {
  /** Append an event to the stream. Returns the assigned offset. */
  append(event: DurableEvent): number;

  /** Read all entries from `fromOffset` (inclusive) to current tail. */
  read(fromOffset?: number): StreamEntry[];

  /** Current number of entries in the stream. */
  readonly length: number;

  /** Whether the stream has been closed (workflow complete/halted). */
  readonly closed: boolean;

  /** Close the stream, signaling EOF. */
  close(): void;
}

// ── Divergence Error ───────────────────────────────────────────────

/**
 * Thrown when replay detects that the current execution has diverged
 * from the recorded stream.
 */
export class DivergenceError extends Error {
  override name = "DivergenceError";
  expected: string;
  actual: string;
  offset: number;

  constructor(expected: string, actual: string, offset: number) {
    super(
      `Divergence at offset ${offset}: expected "${expected}" but got "${actual}"`,
    );
    this.expected = expected;
    this.actual = actual;
    this.offset = offset;
  }
}

// ── Serialization helpers ──────────────────────────────────────────

/**
 * Non-JSON-serializable values are stored as this sentinel.
 * During replay, encountering a sentinel means the value cannot
 * be reconstructed from the stream alone.
 */
export interface LiveOnlySentinel {
  __liveOnly: true;
  __type: string;
  __toString: string;
}

export function isLiveOnly(value: Json): value is Json & LiveOnlySentinel {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    (value as Record<string, unknown>).__liveOnly === true
  );
}

export function createLiveOnlySentinel(value: unknown): LiveOnlySentinel {
  return {
    __liveOnly: true,
    __type:
      typeof value === "object" && value !== null
        ? (value.constructor?.name ?? "Object")
        : typeof value,
    __toString: String(value),
  };
}
