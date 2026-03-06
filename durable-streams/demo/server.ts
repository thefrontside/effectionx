/**
 * Pane A: Standalone Durable Streams server.
 *
 * Usage: node --experimental-strip-types demo/server.ts
 *
 * Starts a DurableStreamTestServer on port 4437 using Effection's main()
 * entrypoint. The server is wrapped as a resource — cleanup (server.stop())
 * runs automatically when the process receives SIGINT/SIGTERM.
 */

import { DurableStreamTestServer } from "@durable-streams/server";
import { call, main, resource, suspend } from "effection";
import type { Operation } from "effection";

/**
 * Effection resource that manages a DurableStreamTestServer lifecycle.
 *
 * - Starts the server in the setup phase (before provide)
 * - Provides the running server as the resource value
 * - Stops the server in teardown (finally block) when the scope is destroyed
 */
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

await main(function* () {
  const server = yield* useDurableStreamTestServer();
  console.log(`\n  Durable Streams server listening at ${server.url}`);
  console.log("  Press Ctrl+C to stop.\n");
  yield* suspend();
});
