/**
 * Durable Streams observer: server + live journal tailer in one process.
 *
 * Usage: node --experimental-strip-types demo/observe.ts
 *
 * Starts a DurableStreamTestServer and tails the journal via SSE, printing
 * color-coded events as they arrive. Ctrl+C triggers clean shutdown.
 *
 *   #1  yield  root.0        call(chop-onion)     ok  "onion chopped"
 *   #5  yield  root.0        sleep(sleep)         ok
 *   #18 close  root.1.1                           cancelled
 *   #22 close  root                               ok  "Dinner is served!"
 */

import { FetchError, stream as fetchStream } from "@durable-streams/client";
import { DurableStreamTestServer } from "@durable-streams/server";
import { call, createChannel, each, main, resource, spawn } from "effection";
import type { Operation, Stream } from "effection";
import type { DurableEvent } from "../mod.ts";

// ---------------------------------------------------------------------------
// ANSI helpers
// ---------------------------------------------------------------------------

const c = {
  reset: "\x1b[0m",
  bold: "\x1b[1m",
  dim: "\x1b[2m",

  // foreground
  red: "\x1b[31m",
  green: "\x1b[32m",
  yellow: "\x1b[33m",
  blue: "\x1b[34m",
  magenta: "\x1b[35m",
  cyan: "\x1b[36m",
  white: "\x1b[37m",
  gray: "\x1b[90m",
};

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------

const STREAM_ID = process.env.DURABLE_STREAM_ID ?? "dinner-demo";

// ---------------------------------------------------------------------------
// Resources
// ---------------------------------------------------------------------------

function useDurableStreamTestServer(): Operation<DurableStreamTestServer> {
  return resource(function* (provide) {
    const server = new DurableStreamTestServer();
    yield* call(() => server.start());
    try {
      yield* provide(server);
    } finally {
      yield* call(() => server.stop());
    }
  });
}

interface TailOptions {
  url: string;
  offset?: string;
}

function useDurableStreamTail(opts: TailOptions): Stream<DurableEvent, void> {
  return resource(function* (provide) {
    const channel = createChannel<DurableEvent>();

    const res = yield* call(() =>
      fetchStream<DurableEvent>({
        url: opts.url,
        offset: opts.offset ?? "-1",
        live: true,
        onError: async (error) => {
          if (error instanceof FetchError && error.status === 404) {
            await new Promise((r) => setTimeout(r, 500));
            return {};
          }
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

function statusColor(status: string): string {
  switch (status) {
    case "ok":
      return c.green;
    case "err":
      return c.red;
    case "cancelled":
      return c.yellow;
    default:
      return c.white;
  }
}

function typeColor(type: string): string {
  return type === "yield" ? c.cyan : c.magenta;
}

function formatEvent(n: number, event: DurableEvent): string {
  const idx = `${c.dim}#${String(n).padEnd(3)}${c.reset}`;
  const type = `${typeColor(event.type)}${event.type.padEnd(5)}${c.reset}`;
  const cid = `${c.blue}${event.coroutineId.padEnd(14)}${c.reset}`;

  const status = event.result.status;
  const styledStatus = `${statusColor(status)}${status}${c.reset}`;

  if (event.type === "yield") {
    const desc = `${event.description.type}(${c.bold}${event.description.name}${c.reset})`;
    const descPad = desc + " ".repeat(Math.max(0, 22 - plainLength(desc)));
    const val =
      event.result.status === "ok" && event.result.value !== undefined
        ? `  ${c.dim}${JSON.stringify(event.result.value)}${c.reset}`
        : "";
    return `  ${idx} ${type} ${cid} ${descPad} ${styledStatus}${val}`;
  }

  // close event
  const pad = " ".repeat(22);
  const val =
    event.result.status === "ok" && event.result.value !== undefined
      ? `  ${c.dim}${JSON.stringify(event.result.value)}${c.reset}`
      : "";
  return `  ${idx} ${type} ${cid} ${pad} ${styledStatus}${val}`;
}

/** Length of a string without ANSI escape codes. */
function plainLength(s: string): number {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: stripping ANSI escapes
  return s.replace(/\x1b\[[0-9;]*m/g, "").length;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

await main(function* () {
  const server = yield* useDurableStreamTestServer();
  const streamUrl = `${server.url}/${STREAM_ID}`;

  console.log();
  console.log(`  ${c.bold}${c.cyan}Durable Streams Observer${c.reset}`);
  console.log(`  ${c.dim}${"═".repeat(24)}${c.reset}`);
  console.log(`  ${c.dim}Server${c.reset}   ${server.url}`);
  console.log(`  ${c.dim}Stream${c.reset}   ${STREAM_ID}`);
  console.log(`  ${c.dim}Mode${c.reset}     SSE/live`);
  console.log();
  console.log(`  ${c.dim}Watching for events...${c.reset}`);
  console.log();

  let eventCount = 0;
  for (const event of yield* each(useDurableStreamTail({ url: streamUrl }))) {
    eventCount++;
    console.log(formatEvent(eventCount, event));
    yield* each.next();
  }
});
