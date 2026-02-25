/**
 * Shared test helpers for durably test suites.
 *
 * Centralizes stream-reading utilities so filtering logic
 * isn't duplicated across test files.
 */
import type { DurableEvent } from "./types.ts";
import type { InMemoryDurableStream } from "./stream.ts";
import { INFRASTRUCTURE_EFFECTS } from "./durable-reducer.ts";

/** Return all events from the stream. */
export function allEvents(stream: InMemoryDurableStream): DurableEvent[] {
  return stream.read().map((e) => e.event);
}

/**
 * Return only scope lifecycle events (created/destroyed).
 */
export function scopeEvents(stream: InMemoryDurableStream): DurableEvent[] {
  return stream
    .read()
    .map((e) => e.event)
    .filter((e) => e.type === "scope:created" || e.type === "scope:destroyed");
}

/**
 * Return events with common infrastructure effects filtered out.
 * Filters: useCoroutine(), do <...> (generator delegation).
 */
export function userEvents(stream: InMemoryDurableStream): DurableEvent[] {
  return stream
    .read()
    .map((e) => e.event)
    .filter((e) => {
      if (e.type === "effect:yielded") {
        let desc = e.description;
        if (desc === "useCoroutine()" || desc.startsWith("do <")) {
          return false;
        }
      }
      return true;
    });
}

/**
 * Return events with all infrastructure effects filtered out.
 * Filters everything in INFRASTRUCTURE_EFFECTS plus "do <..." patterns.
 */
export function userFacingEffects(
  stream: InMemoryDurableStream,
): DurableEvent[] {
  return stream
    .read()
    .map((e) => e.event)
    .filter((e) => {
      if (e.type === "effect:yielded") {
        if (INFRASTRUCTURE_EFFECTS.includes(e.description)) return false;
        if (e.description.startsWith("do <")) return false;
      }
      return true;
    });
}

/**
 * Extract sequential (yielded, resolved/errored) pairs for user-facing effects.
 *
 * **Important**: This assumes yielded and resolved events are adjacent in the
 * stream, which only holds for sequential single-scope workflows. Do not use
 * for concurrent workflow tests where effects may interleave.
 */
export function userEffectPairs(
  stream: InMemoryDurableStream,
): Array<[DurableEvent, DurableEvent]> {
  let events = stream.read().map((e) => e.event);
  let pairs: Array<[DurableEvent, DurableEvent]> = [];
  for (let i = 0; i < events.length - 1; i++) {
    let ev = events[i];
    if (ev.type !== "effect:yielded") continue;
    if (
      ev.description === "useCoroutine()" ||
      ev.description.startsWith("do <")
    )
      continue;
    let next = events[i + 1];
    if (
      next &&
      (next.type === "effect:resolved" || next.type === "effect:errored") &&
      next.effectId === ev.effectId
    ) {
      pairs.push([ev, next]);
      i++;
    }
  }
  return pairs;
}
