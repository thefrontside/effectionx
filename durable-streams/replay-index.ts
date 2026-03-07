/**
 * ReplayIndex — derived, in-memory structure built from the stream on startup.
 *
 * Provides per-coroutine cursored access to Yield events and keyed access
 * to Close events. See spec §4.1.
 */

import type {
  Close,
  CoroutineId,
  DurableEvent,
  EffectDescription,
  Result,
} from "./types.ts";

export interface YieldEntry {
  description: EffectDescription;
  result: Result;
}

export class ReplayIndex {
  private yields = new Map<CoroutineId, YieldEntry[]>();
  private cursors = new Map<CoroutineId, number>();
  private closes = new Map<CoroutineId, Close>();
  /** Coroutines where replay has been disabled (run-live mode). */
  private disabled = new Set<CoroutineId>();

  constructor(events: DurableEvent[]) {
    for (const event of events) {
      if (event.type === "yield") {
        let list = this.yields.get(event.coroutineId);
        if (!list) {
          list = [];
          this.yields.set(event.coroutineId, list);
        }
        list.push({
          description: event.description,
          result: event.result,
        });
      }
      if (event.type === "close") {
        this.closes.set(event.coroutineId, event);
      }
    }
  }

  /**
   * Disable replay for a coroutine (run-live mode).
   *
   * Once disabled, peekYield() returns undefined and hasClose() returns
   * false for this coroutine, so all subsequent effects execute live
   * and no further divergence checks are triggered.
   */
  disableReplay(coroutineId: CoroutineId): void {
    this.disabled.add(coroutineId);
  }

  /** Returns true if replay has been disabled for this coroutine. */
  isReplayDisabled(coroutineId: CoroutineId): boolean {
    return this.disabled.has(coroutineId);
  }

  /**
   * Returns the next unconsumed yield for this coroutine,
   * or undefined if the cursor is past the end or replay is disabled.
   */
  peekYield(coroutineId: CoroutineId): YieldEntry | undefined {
    if (this.disabled.has(coroutineId)) return undefined;
    const list = this.yields.get(coroutineId);
    const cursor = this.cursors.get(coroutineId) ?? 0;
    return list?.[cursor];
  }

  /** Advances the cursor for this coroutine by one position. */
  consumeYield(coroutineId: CoroutineId): void {
    const cursor = this.cursors.get(coroutineId) ?? 0;
    this.cursors.set(coroutineId, cursor + 1);
  }

  /** Returns the current cursor position for this coroutine. */
  getCursor(coroutineId: CoroutineId): number {
    return this.cursors.get(coroutineId) ?? 0;
  }

  /** Returns true if a Close event exists for this coroutine (and replay is not disabled). */
  hasClose(coroutineId: CoroutineId): boolean {
    if (this.disabled.has(coroutineId)) return false;
    return this.closes.has(coroutineId);
  }

  /** Returns the Close event for this coroutine, or undefined. */
  getClose(coroutineId: CoroutineId): Close | undefined {
    if (this.disabled.has(coroutineId)) return undefined;
    return this.closes.get(coroutineId);
  }

  /**
   * Returns true if any non-disabled coroutine still has unconsumed yields.
   *
   * This is used by durableRun to detect early-return divergence even when
   * unconsumed entries belong to child coroutines rather than the root.
   */
  hasAnyUnconsumedYields(): boolean {
    for (const [coroutineId, entries] of this.yields.entries()) {
      if (this.disabled.has(coroutineId)) continue;
      const cursor = this.cursors.get(coroutineId) ?? 0;
      if (cursor < entries.length) return true;
    }
    return false;
  }

  /**
   * Return the first non-disabled coroutine with unconsumed yields.
   *
   * NOTE: Closed coroutines are skipped because their yields were consumed
   * by the child's own replay path (via runDurableChild). This means
   * orphaned children (recorded in the journal but never spawned in the
   * current run) are not detected here. Orphan detection requires tracking
   * which coroutine IDs were visited during the current run, which is a
   * future enhancement.
   */
  firstUnconsumed():
    | {
        coroutineId: CoroutineId;
        cursor: number;
        totalYields: number;
      }
    | undefined {
    for (const [coroutineId, entries] of this.yields.entries()) {
      if (this.disabled.has(coroutineId)) continue;
      if (this.closes.has(coroutineId)) continue;
      const cursor = this.cursors.get(coroutineId) ?? 0;
      if (cursor < entries.length) {
        return { coroutineId, cursor, totalYields: entries.length };
      }
    }
    return undefined;
  }

  /**
   * Returns true if the cursor for this coroutine has been fully consumed
   * AND a Close event exists. This means the coroutine completed in a
   * previous run and can be treated as fully replayed.
   *
   * Returns false if replay is disabled (run-live mode).
   */
  isFullyReplayed(coroutineId: CoroutineId): boolean {
    if (this.disabled.has(coroutineId)) return false;
    return (
      this.peekYield(coroutineId) === undefined && this.hasClose(coroutineId)
    );
  }

  /** Returns the total number of yield entries for this coroutine. */
  yieldCount(coroutineId: CoroutineId): number {
    return this.yields.get(coroutineId)?.length ?? 0;
  }
}
