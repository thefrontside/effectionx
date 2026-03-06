/**
 * Pane C: Compact journal tailer.
 *
 * Usage: node --experimental-strip-types demo/tail.ts
 *
 * Polls the Durable Streams server and prints new events in a compact format:
 *   #<n> <yield|close> <coroutineId> <type>(<name>) <status> <value?>
 *
 * Examples:
 *   #1  yield  root.0  call(chop-onion)   ok  "onion chopped"
 *   #5  yield  root.0  sleep(sleep)       ok
 *   #18 close  root.1.1  cancelled
 *   #22 close  root  ok  "Dinner is served!"
 */

import { stream as fetchStream } from "@durable-streams/client";
import type { DurableEvent } from "../mod.ts";

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const SERVER_URL = process.env.DURABLE_SERVER_URL ?? "http://localhost:4437";
const STREAM_ID = process.env.DURABLE_STREAM_ID ?? "dinner-demo";
const POLL_MS = 500;

const streamUrl = `${SERVER_URL}/${STREAM_ID}`;

function isNotFoundError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  const upper = message.toUpperCase();
  return upper.includes("NOT_FOUND") || upper.includes("404");
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
// Main loop
// ---------------------------------------------------------------------------

console.log(`\n  Journal Tailer`);
console.log(`  ══════════════`);
console.log(`  Stream: ${streamUrl}`);
console.log(`  Polling every ${POLL_MS}ms\n`);

let eventCount = 0;
let lastOffset = "-1";
let streamReady = false;

// Wait for the stream to exist (the server might not have it yet)
while (!streamReady) {
  try {
    const res = await fetchStream({
      url: streamUrl,
      offset: "-1",
      live: false,
    });
    await res.json(); // consume body
    streamReady = true;
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    // Stream doesn't exist yet — wait and retry
    await new Promise((r) => setTimeout(r, POLL_MS));
  }
}

console.log("  Watching for events...\n");

// Poll loop
while (true) {
  try {
    const res = await fetchStream({
      url: streamUrl,
      offset: lastOffset,
      live: false,
    });

    const events = (await res.json()) as DurableEvent[];

    for (const event of events) {
      eventCount++;
      console.log(formatEvent(eventCount, event));
    }

    if (res.offset) {
      lastOffset = res.offset;
    }
  } catch (error) {
    if (!isNotFoundError(error)) {
      throw error;
    }

    // Stream disappeared — retry on next poll
  }

  await new Promise((r) => setTimeout(r, POLL_MS));
}
