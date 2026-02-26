/**
 * Shared test helpers for @effectionx/durable test suites.
 */
import type { Operation } from "effection";
import { INFRASTRUCTURE_EFFECTS } from "./reducer.ts";
import type { InMemoryDurableStream } from "./stream.ts";
import type { DurableEvent, DurableOperation } from "./types.ts";

/**
 * Cast a plain Operation factory to a DurableOperation factory for tests.
 *
 * In production code, only the durable runtime mints branded operations.
 * In tests, we need to pass plain generators to `durable()`. This helper
 * performs the unsafe cast so test code doesn't need `as unknown as`.
 */
export function op<T>(fn: () => Operation<T>): () => DurableOperation<T> {
  return fn as unknown as () => DurableOperation<T>;
}

/** Return all events from the stream. */
export function allEvents(stream: InMemoryDurableStream): DurableEvent[] {
  return stream.read().map((e) => e.event);
}

/**
 * Return only spawn and close events.
 */
export function lifecycleEvents(stream: InMemoryDurableStream): DurableEvent[] {
  return stream
    .read()
    .map((e) => e.event)
    .filter((e) => e.type === "spawn" || e.type === "close");
}

/**
 * Return events with all infrastructure effects filtered out.
 */
export function userFacingEvents(
  stream: InMemoryDurableStream,
): DurableEvent[] {
  return stream
    .read()
    .map((e) => e.event)
    .filter((e) => {
      if (e.type === "yield") {
        if (INFRASTRUCTURE_EFFECTS.has(e.description)) return false;
        if (e.description.startsWith("do <")) return false;
      }
      return true;
    });
}

/**
 * Extract sequential (yield, next) pairs for user-facing effects.
 *
 * Assumes yield and next events are adjacent in the stream.
 * Only valid for sequential single-coroutine workflows.
 */
export function userEffectPairs(
  stream: InMemoryDurableStream,
): Array<[DurableEvent, DurableEvent]> {
  let events = stream.read().map((e) => e.event);
  let pairs: Array<[DurableEvent, DurableEvent]> = [];
  for (let i = 0; i < events.length - 1; i++) {
    let ev = events[i];
    if (ev.type !== "yield") continue;
    if (INFRASTRUCTURE_EFFECTS.has(ev.description)) continue;
    if (ev.description.startsWith("do <")) continue;
    let next = events[i + 1];
    if (next && next.type === "next" && next.effectId === ev.effectId) {
      pairs.push([ev, next]);
      i++;
    }
  }
  return pairs;
}
