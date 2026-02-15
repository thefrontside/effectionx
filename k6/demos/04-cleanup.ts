/**
 * Demo 04: Structured Cleanup and Teardown
 *
 * This demo shows how @effectionx/k6 provides structured cleanup semantics
 * that K6 lacks. Resources are automatically cleaned up when their scope
 * ends, whether normally, via error, or via timeout.
 *
 * THE PROBLEM:
 * In standard K6, there's no built-in way to ensure cleanup happens:
 * - setTimeout callbacks might not fire
 * - WebSocket.close() might not be called
 * - Database connections might leak
 * - Files might not be closed
 *
 * THE SOLUTION:
 * @effectionx/k6 uses Effection's structured concurrency model:
 * - Resources have explicit lifetimes tied to scopes
 * - Cleanup runs in finally blocks that are guaranteed to execute
 * - Even when errors occur, cleanup still happens
 * - Parent scope cleanup waits for child cleanup to complete
 *
 * Run with: k6 run dist/demos/04-cleanup.js
 */

import { main, group, useWebSocket, http } from "../lib/mod.ts";
import { resource, spawn, sleep, type Operation } from "effection";

// K6 options
export const options = {
  vus: 1,
  iterations: 1,
};

// Configurable WebSocket URL (defaults to echo.websocket.org)
const WS_URL = __ENV.WS_URL || "wss://echo.websocket.org";

/**
 * A simple tracked resource for demo purposes.
 */
interface TrackedResource {
  name: string;
}

/**
 * Example of a custom resource with cleanup.
 * This could be a database connection, file handle, etc.
 */
function useTrackingResource(name: string): Operation<TrackedResource> {
  return resource(function* (provide) {
    console.log(`[${name}] Resource acquired`);

    try {
      yield* provide({ name });
    } finally {
      // This ALWAYS runs, even on error or scope exit
      console.log(`[${name}] Resource cleaned up`);
    }
  });
}

export default main(function* () {
  console.log("=== Demo: Structured Cleanup ===\n");

  // Demo 1: Normal scope exit
  console.log("--- Demo 1: Normal scope exit ---");
  yield* group("normal-exit", function* () {
    const res = yield* useTrackingResource("resource-1");
    console.log(`Using ${res.name}...`);
    yield* sleep(100);
    console.log(`Done with ${res.name}`);
    // Cleanup happens automatically when group ends
  });
  console.log("After group - resource was cleaned up\n");

  // Demo 2: Cleanup on error
  console.log("--- Demo 2: Cleanup on error ---");
  try {
    yield* group("error-exit", function* () {
      const res = yield* useTrackingResource("resource-2");
      console.log(`Using ${res.name}...`);
      throw new Error("Something went wrong!");
      // Cleanup STILL happens even though we threw
    });
  } catch (error) {
    console.log(`Caught error: ${(error as Error).message}`);
    console.log("Resource was STILL cleaned up!\n");
  }

  // Demo 3: Nested resources - cleanup in reverse order
  console.log("--- Demo 3: Nested resources ---");
  yield* group("nested", function* () {
    const outer = yield* useTrackingResource("outer");
    console.log(`Acquired ${outer.name}`);

    const inner = yield* useTrackingResource("inner");
    console.log(`Acquired ${inner.name}`);

    console.log("About to exit scope...");
    // Cleanup happens in reverse order: inner first, then outer
  });
  console.log("Both resources cleaned up in correct order\n");

  // Demo 4: WebSocket cleanup
  console.log("--- Demo 4: WebSocket automatic cleanup ---");
  yield* group("websocket-cleanup", function* () {
    console.log("Connecting to WebSocket...");
    const ws = yield* useWebSocket(WS_URL);
    console.log("WebSocket connected!");

    ws.send("Hello!");
    console.log("Sent message");

    // Even without explicit close(), WebSocket is cleaned up
    console.log("Exiting scope without explicit close...");
  });
  console.log("WebSocket was automatically closed!\n");

  // Demo 5: Spawned tasks are cleaned up with their parent
  console.log("--- Demo 5: Child task cleanup ---");
  yield* group("child-cleanup", function* () {
    yield* spawn(function* () {
      const res = yield* useTrackingResource("child-resource");
      console.log(`Child task using ${res.name}`);

      // This would run forever, but parent exits first
      while (true) {
        yield* sleep(50);
        console.log("Child still running...");
      }
    });

    // Parent does some work then exits
    yield* sleep(150);
    console.log("Parent exiting, child will be cleaned up");
  });
  console.log("Child task and its resources were cleaned up!\n");

  console.log("=== Demo Complete ===");
  console.log("All resources were properly cleaned up in all scenarios!");
});
