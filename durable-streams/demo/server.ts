/**
 * Pane A: Standalone Durable Streams server.
 *
 * Usage: node --experimental-strip-types demo/server.ts
 *
 * Starts a DurableStreamTestServer on port 4437 and prints its URL.
 * Runs until interrupted (Ctrl+C).
 */

import { DurableStreamTestServer } from "@durable-streams/server";

const server = new DurableStreamTestServer();

await server.start();

console.log(`Durable Streams server listening at ${server.url}`);
console.log("Press Ctrl+C to stop.\n");

// Keep the process alive until interrupted
process.on("SIGINT", async () => {
  console.log("\nShutting down...");
  try {
    await server.stop();
    process.exit(0);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Failed to stop server cleanly: ${message}`);
    process.exit(1);
  }
});

// Block forever
await new Promise(() => {});
