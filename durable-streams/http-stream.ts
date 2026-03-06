/**
 * HTTP-backed DurableStream implementation using the Durable Streams protocol.
 *
 * Uses raw fetch() for appends (not IdempotentProducer) because durable
 * execution requires synchronous acknowledgment on every write
 * (persist-before-resume). See DEC-026.
 *
 * Concurrent appends are serialized via a Queue + spawned worker so that
 * the server always receives them in sequence order. The worker lives
 * inside a resource scope and is cancelled when the stream is no longer
 * in use. See DEC-033 (supersedes DEC-027's Promise chain approach).
 *
 * The stream is created as an Effection resource via useHttpDurableStream().
 */

import {
  call,
  createQueue,
  resource,
  spawn,
  withResolvers,
} from "effection";
import type { Operation, Queue } from "effection";
import type { DurableStream } from "./stream.ts";
import type { DurableEvent } from "./types.ts";
import {
  stream,
  StaleEpochError,
  SequenceGapError,
  PRODUCER_ID_HEADER,
  PRODUCER_EPOCH_HEADER,
  PRODUCER_SEQ_HEADER,
  PRODUCER_EXPECTED_SEQ_HEADER,
  PRODUCER_RECEIVED_SEQ_HEADER,
  STREAM_OFFSET_HEADER,
} from "@durable-streams/client";

/**
 * Configuration for useHttpDurableStream.
 */
export interface HttpDurableStreamOptions {
  /** Base URL of the Durable Streams server (e.g. "http://localhost:4437"). */
  baseUrl: string;
  /** Stream identifier. Will be used as the URL path segment. */
  streamId: string;
  /** Unique producer identifier for idempotent append tracking. */
  producerId: string;
  /** Producer epoch — monotonically increasing. Stale epochs are fenced. */
  epoch: number;
  /** Optional custom fetch implementation (for testing). */
  fetch?: typeof globalThis.fetch;
}

/**
 * Extended DurableStream with HTTP-specific observable state.
 */
export interface HttpDurableStreamHandle extends DurableStream {
  /**
   * Last Stream-Next-Offset received from the server.
   * Tracked from both reads and writes (DEC-029).
   * This is the resumption point for future tail() calls.
   */
  lastOffset: string | undefined;
}

/** Request sent to the serial append worker. */
interface AppendRequest {
  event: DurableEvent;
  seq: number;
  resolve: (value: void) => void;
  reject: (error: Error) => void;
}

/**
 * Create an HTTP-backed DurableStream as an Effection resource.
 *
 * The resource:
 * 1. Creates the stream on the server (idempotent PUT)
 * 2. Spawns a serial worker that processes appends in FIFO order
 * 3. Returns a DurableStream handle with Operation-native readAll/append
 *
 * The worker is cancelled when the resource scope is torn down.
 *
 * Usage:
 *   yield* useHttpDurableStream({ baseUrl, streamId, producerId, epoch })
 */
export function useHttpDurableStream(
  opts: HttpDurableStreamOptions,
): Operation<HttpDurableStreamHandle> {
  return resource(function* (provide) {
    const streamUrl = `${opts.baseUrl}/${opts.streamId}`;
    const producerId = opts.producerId;
    const epoch = opts.epoch;
    const fetchFn = opts.fetch ?? globalThis.fetch.bind(globalThis);

    // ── One-time setup: create the stream on the server ──
    yield* call(async () => {
      const res = await fetchFn(streamUrl, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
      });
      await res.text(); // consume body to free connection
      if (res.status !== 201 && res.status !== 200) {
        throw new Error(`Failed to create stream: HTTP ${res.status}`);
      }
    });

    // ── Mutable state owned by the resource scope ──
    let nextSeq = 0;
    let fatalError: Error | undefined;
    let lastOffset: string | undefined;

    // ── Append worker queue ──
    const queue: Queue<AppendRequest, void> = createQueue<AppendRequest, void>();

    // ── Spawn the serial append worker ──
    // Processes one append at a time in FIFO order. Each HTTP POST
    // completes before the next one starts, guaranteeing server-side
    // sequence ordering. Fatal errors (stale epoch, network failure)
    // are propagated to the specific caller and stored for fail-fast.
    yield* spawn(function* () {
      let item = yield* queue.next();
      while (!item.done) {
        const { event, seq, resolve, reject } = item.value;
        try {
          yield* call(() => doAppend(event, seq));
          resolve(undefined);
        } catch (err) {
          reject(err instanceof Error ? err : new Error(String(err)));
        }
        item = yield* queue.next();
      }
    });

    /**
     * Execute a single HTTP append with the given event and sequence number.
     *
     * Any uncertain write outcome (network error, unexpected HTTP status,
     * sequence gap) is treated as fatal — `fatalError` is set so all future
     * appends fail-fast.
     */
    async function doAppend(event: DurableEvent, seq: number): Promise<void> {
      // Double-check fatal error (may have been set by a preceding append)
      if (fatalError) {
        throw fatalError;
      }

      let res: Response;
      try {
        res = await fetchFn(streamUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            [PRODUCER_ID_HEADER]: producerId,
            [PRODUCER_EPOCH_HEADER]: String(epoch),
            [PRODUCER_SEQ_HEADER]: String(seq),
          },
          body: JSON.stringify(event),
        });
      } catch (err) {
        // Network failure — fatal, sequence state is now uncertain
        const error = err instanceof Error ? err : new Error(String(err));
        fatalError = error;
        throw error;
      }

      // Always consume the body to free the connection
      await res.text();

      switch (res.status) {
        case 200: {
          // Success — capture offset
          const offset = res.headers.get(STREAM_OFFSET_HEADER);
          if (offset) {
            lastOffset = offset;
          }
          return;
        }
        case 204: {
          // Duplicate (idempotent success) — capture offset if present
          const offset = res.headers.get(STREAM_OFFSET_HEADER);
          if (offset) {
            lastOffset = offset;
          }
          return;
        }
        case 403: {
          // Stale epoch — fatal error
          const currentEpoch = Number(
            res.headers.get(PRODUCER_EPOCH_HEADER) ?? 0,
          );
          const error = new StaleEpochError(currentEpoch);
          fatalError = error;
          throw error;
        }
        case 409: {
          // Sequence gap — fatal (should never happen due to serialization,
          // but if it does, sequence state is irrecoverably desynchronized)
          const expected = Number(
            res.headers.get(PRODUCER_EXPECTED_SEQ_HEADER) ?? 0,
          );
          const received = Number(
            res.headers.get(PRODUCER_RECEIVED_SEQ_HEADER) ?? 0,
          );
          const error = new SequenceGapError(expected, received);
          fatalError = error;
          throw error;
        }
        default: {
          // Unexpected status — fatal, write outcome is uncertain.
          // TODO: Transient errors (500, 503) could be retried with the
          // same seq in a future version. See DEC-026 rationale.
          const error = new Error(
            `Unexpected append response: HTTP ${res.status}`,
          );
          fatalError = error;
          throw error;
        }
      }
    }

    // ── Provide the DurableStream handle ──
    yield* provide({
      get lastOffset() {
        return lastOffset;
      },

      /**
       * Read all events in the stream, in append order.
       *
       * Uses the stream() function from @durable-streams/client with
       * offset="-1" (start of stream) and live=false (no tailing).
       */
      *readAll(): Operation<DurableEvent[]> {
        return yield* call(async () => {
          const res = await stream({
            url: streamUrl,
            offset: "-1",
            live: false,
            fetch: fetchFn,
          });
          const events = (await res.json()) as DurableEvent[];
          // Track offset from read (DEC-029)
          if (res.offset) {
            lastOffset = res.offset;
          }
          return events;
        });
      },

      /**
       * Append an event to the stream.
       *
       * Sequence numbers are assigned synchronously when the generator is
       * started. The actual HTTP call is dispatched to the serial worker
       * via the queue. The caller suspends until the worker completes the
       * POST and signals via withResolvers.
       *
       * Fatal errors (stale epoch, network failure) are stored and cause
       * all future appends to fail-fast without enqueuing.
       */
      *append(event: DurableEvent): Operation<void> {
        // Fail-fast if a fatal error has been set
        if (fatalError) {
          throw fatalError;
        }

        // Assign seq synchronously — ordering is locked in before any
        // async work, even when multiple coroutines call append concurrently
        const seq = nextSeq++;

        // Create a resolver so we can wait for this specific append to complete
        const { operation, resolve, reject } = withResolvers<void>();

        // Enqueue the request — the worker will process it in FIFO order
        queue.add({ event, seq, resolve, reject });

        // Suspend until the worker finishes the HTTP POST for this item
        yield* operation;
      },
    });
  });
}
