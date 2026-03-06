/**
 * Error types for the durable execution protocol.
 */

import type { CoroutineId, EffectDescription } from "./types.ts";

/**
 * Raised when the replay index entry at the current cursor position
 * does not match the effect yielded by the generator. See spec §6.2.
 *
 * A DivergenceError is NOT recoverable. The workflow cannot continue
 * because the generator's execution path has diverged from the recorded
 * history.
 */
export class DivergenceError extends Error {
  override name = "DivergenceError";

  coroutineId: CoroutineId;
  /** Cursor position within the coroutine where divergence was detected. */
  position: number;
  /** The description from the journal (what was expected). */
  expected: EffectDescription;
  /** The description from the generator (what was actually yielded). */
  actual: EffectDescription;

  constructor(
    coroutineId: CoroutineId,
    position: number,
    expected: EffectDescription,
    actual: EffectDescription,
    message?: string,
  ) {
    super(
      message ??
        `Divergence at ${coroutineId}[${position}]: ` +
          `expected ${expected.type}("${expected.name}"), ` +
          `got ${actual.type}("${actual.name}")`,
    );
    this.coroutineId = coroutineId;
    this.position = position;
    this.expected = expected;
    this.actual = actual;
  }
}

/**
 * Raised when the generator finishes (returns) while the replay index
 * still has unconsumed entries for this coroutine. See spec §6.3.
 */
export class EarlyReturnDivergenceError extends Error {
  override name = "EarlyReturnDivergenceError";

  coroutineId: CoroutineId;
  consumedCount: number;
  totalCount: number;

  constructor(
    coroutineId: CoroutineId,
    consumedCount: number,
    totalCount: number,
  ) {
    super(
      `Divergence: generator ${coroutineId} returned after ${consumedCount} yields, ` +
        `but journal has ${totalCount} yield entries`,
    );
    this.coroutineId = coroutineId;
    this.consumedCount = consumedCount;
    this.totalCount = totalCount;
  }
}

/**
 * Raised when the journal has a Close event for a coroutine but the
 * generator has not finished after consuming all recorded yields.
 * See spec §6.3.
 */
export class ContinuePastCloseDivergenceError extends Error {
  override name = "ContinuePastCloseDivergenceError";

  coroutineId: CoroutineId;
  yieldCount: number;

  constructor(coroutineId: CoroutineId, yieldCount: number) {
    super(
      `Divergence: journal shows ${coroutineId} closed after ${yieldCount} yields, but generator continues to yield effects`,
    );
    this.coroutineId = coroutineId;
    this.yieldCount = yieldCount;
  }
}

/**
 * Raised by a replay guard when a journal entry's recorded result is
 * stale (e.g., the source file has changed since the effect was
 * originally executed).
 *
 * Guards detect staleness by comparing current state against data stored
 * in the effect description (input fields like file path) and result
 * value (output fields like content hash).
 *
 * StaleInputError is NOT a divergence — the effect identity matches,
 * but the external world has changed. The correct response depends on
 * application policy: re-run from scratch, accept stale results, or
 * (in future versions) re-execute the effect and continue.
 *
 * See replay-guard-spec.md §4.4.
 */
export class StaleInputError extends Error {
  override name = "StaleInputError";

  /** The Yield event that was detected as stale. */
  event?: { coroutineId: string; description: { type: string; name: string } };

  constructor(
    /** Human-readable description of what changed. */
    message: string,
    /** The Yield event that was detected as stale. */
    event?: {
      coroutineId: string;
      description: { type: string; name: string };
    },
  ) {
    super(message);
    this.event = event;
  }
}
