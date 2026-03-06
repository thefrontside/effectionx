/**
 * DurableStream interface and in-memory implementation.
 *
 * The interface is intentionally abstract — protocol-specification.md §11
 * does not prescribe a physical encoding or transport.
 */

import type { Operation } from "effection";
import type { DurableEvent } from "./types.ts";

function cloneEvent(event: DurableEvent): DurableEvent {
  return structuredClone(event);
}

function cloneEvents(events: DurableEvent[]): DurableEvent[] {
  return events.map(cloneEvent);
}

/**
 * Abstract interface for the append-only durable event stream.
 *
 * Implementations must guarantee:
 * - Append-only (events are never updated or deleted)
 * - Prefix-closed (no gaps)
 * - Monotonic indexing (sequential offsets)
 * - Durability (once append resolves, the event persists)
 */
export interface DurableStream {
  /** Read all events in the stream, in append order. */
  readAll(): Operation<DurableEvent[]>;

  /**
   * Append an event to the stream.
   * The returned operation completes only after the event is durably persisted.
   */
  append(event: DurableEvent): Operation<void>;
}

/**
 * In-memory DurableStream implementation for testing.
 *
 * Provides optional hooks for:
 * - Tracking append calls (to verify no re-execution during replay)
 * - Injecting failures (for persist-before-resume testing)
 */
export class InMemoryStream implements DurableStream {
  private events: DurableEvent[] = [];

  /** Count of append calls, useful for verifying replay doesn't re-execute. */
  appendCount = 0;

  /** If set, append() will reject with this error. */
  injectFailure: Error | null = null;

  /** Optional callback invoked on each append, before persistence. */
  onAppend: ((event: DurableEvent) => void) | null = null;

  constructor(initialEvents: DurableEvent[] = []) {
    this.events = cloneEvents(initialEvents);
  }

  // deno-lint-ignore require-yield
  *readAll(): Operation<DurableEvent[]> {
    return cloneEvents(this.events);
  }

  // deno-lint-ignore require-yield
  *append(event: DurableEvent): Operation<void> {
    if (this.injectFailure) {
      throw this.injectFailure;
    }
    const cloned = cloneEvent(event);
    this.onAppend?.(cloneEvent(cloned));
    this.events.push(cloned);
    this.appendCount++;
  }

  /** Get a snapshot of current events (for test assertions). */
  snapshot(): DurableEvent[] {
    return cloneEvents(this.events);
  }

  /** Reset the stream (for test setup). */
  reset(events: DurableEvent[] = []): void {
    this.events = cloneEvents(events);
    this.appendCount = 0;
    this.injectFailure = null;
    this.onAppend = null;
  }
}
