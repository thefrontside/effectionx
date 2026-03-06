/**
 * Pane C: Compact journal tailer.
 *
 * Usage: node --experimental-strip-types demo/tail.ts
 *
 * Connects to a Durable Streams server via SSE (live mode) and prints
 * new events in a compact format as they arrive:
 *   #<n> <yield|close> <coroutineId> <type>(<name>) <status> <value?>
 *
 * Examples:
 *   #1  yield  root.0  call(chop-onion)   ok  "onion chopped"
 *   #5  yield  root.0  sleep(sleep)       ok
 *   #18 close  root.1.1  cancelled
 *   #22 close  root  ok  "Dinner is served!"
 *
 * Uses Effection's main() for lifecycle management — Ctrl+C triggers
 * clean shutdown via structured concurrency teardown.
 */

import { stream as fetchStream } from "@durable-streams/client";
import { call, createChannel, each, main, resource, spawn } from "effection";
import type { Stream } from "effection";
import type { DurableEvent } from "../mod.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SERVER_URL = process.env.DURABLE_SERVER_URL ?? "http://localhost:4437";
const STREAM_ID = process.env.DURABLE_STREAM_ID ?? "dinner-demo";
const streamUrl = `${SERVER_URL}/${STREAM_ID}`;

// ---------------------------------------------------------------------------
// Resource: live stream tail as an Effection Subscription
// ---------------------------------------------------------------------------

interface TailOptions {
  /** Full URL of the durable stream to tail. */
  url: string;
  /** Starting offset. Defaults to "-1" (beginning of stream). */
  offset?: string;
}

/**
 * Effection resource that connects to a durable stream in live mode
 * (SSE/long-poll) and produces a Subscription of DurableEvent values.
 *
 * - Retries automatically on NOT_FOUND (stream not yet created)
 * - Cancels the SSE connection on scope teardown
 * - Bridges the async ReadableStream into Effection's channel/subscription
 */
function useDurableStreamTail(opts: TailOptions): Stream<DurableEvent, void> {
  return resource(function* (provide) {
    const channel = createChannel<DurableEvent>();

    const res = yield* call(() =>
      fetchStream<DurableEvent>({
        url: opts.url,
        offset: opts.offset ?? "-1",
        live: true,
        onError: (error) => {
          // Retry on NOT_FOUND — stream may not exist yet
          if (
            "code" in error &&
            (error as { code: string }).code === "NOT_FOUND"
          ) {
            return {}; // retry with backoff
          }
          // Propagate all other errors
          return undefined;
        },
      }),
    );

    yield* spawn(function* () {
      const reader = res.jsonStream().getReader();
      try {
        while (true) {
          const { done, value } = yield* call(() => reader.read());
          if (done) break;
          yield* channel.send(value);
        }
      } finally {
        reader.releaseLock();
        res.cancel();
      }
    });

    yield* provide(yield* channel);
  });
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

function formatEvent(n: number, event: DurableEvent): string {
  const idx = `#${String(n).padEnd(3)}`;
  const type = event.type.padEnd(5);
  const cid = event.coroutineId.padEnd(12);

  if (event.type === "yield") {
    const desc = `${event.description.type}(${event.description.name})`;
    const descPad = desc.padEnd(20);
    const status = event.result.status;
    const val =
      event.result.status === "ok" && event.result.value !== undefined
        ? `  ${JSON.stringify(event.result.value)}`
        : "";
    return `  ${idx} ${type} ${cid} ${descPad} ${status}${val}`;
  }
  // close event — no description
  const status = event.result.status;
  const val =
    event.result.status === "ok" && event.result.value !== undefined
      ? `  ${JSON.stringify(event.result.value)}`
      : "";
  return `  ${idx} ${type} ${cid} ${"".padEnd(20)} ${status}${val}`;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

await main(function* () {
  console.log(`\n  Journal Tailer`);
  console.log(`  ══════════════`);
  console.log(`  Stream: ${streamUrl}`);
  console.log(`  Mode: SSE/live\n`);

  console.log("  Watching for events...\n");

  let eventCount = 0;
  for (const event of yield* each(useDurableStreamTail({ url: streamUrl }))) {
    eventCount++;
    console.log(formatEvent(eventCount, event));
    yield* each.next();
  }
});
