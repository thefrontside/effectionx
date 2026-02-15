/**
 * Demo 03: Proper Error Propagation
 *
 * This demo shows how @effectionx/k6 solves K6's unhandled promise rejection
 * problem (issue #5249) where errors in async code don't fail the test.
 *
 * THE PROBLEM:
 * In standard K6, if a Promise rejects and it's not caught, the error is
 * silently swallowed. The test continues and reports success even though
 * something failed. This makes debugging incredibly difficult.
 *
 * THE SOLUTION:
 * @effectionx/k6's vuIteration() wrapper ensures all errors propagate:
 * - Unhandled errors in the iteration fail the test
 * - Child task failures are fail-fast by default
 * - Stack traces are preserved for debugging
 *
 * Run with: k6 run dist/demos/03-error-propagation.js
 */

import { vuIteration, group, http } from "../lib/mod.ts";
import { spawn, sleep } from "effection";

// K6 options
export const options = {
  vus: 1,
  iterations: 1,
  // We expect this test to fail to demonstrate error propagation
  thresholds: {
    // No thresholds - we want to see the error
  },
};

/**
 * Standard K6 problem demonstration (commented out for reference):
 *
 * export default async function() {
 *   // This error is silently swallowed!
 *   Promise.reject(new Error('Oops!')); // No await = no error
 *
 *   // This also doesn't fail the test
 *   fetch('https://invalid.url.that.does.not.exist')
 *     .then(() => console.log('success'))
 *     // No .catch() = error is swallowed
 *
 *   console.log('Test continues happily');
 *   // Test reports success even though errors occurred
 * }
 */

// Control which demo to run
const DEMO_MODE = __ENV.DEMO_MODE || "success"; // 'success', 'sync-error', 'async-error', 'child-error'

export default vuIteration(function* () {
  console.log("=== Demo: Error Propagation ===\n");
  console.log(`Running in mode: ${DEMO_MODE}\n`);

  if (DEMO_MODE === "success") {
    // Normal successful operation
    yield* group("success-demo", function* () {
      console.log("Making a successful HTTP request...");
      const response = yield* http.get("https://test.k6.io");
      console.log(`Response status: ${response.status}`);
      console.log("Everything worked!");
    });
  } else if (DEMO_MODE === "sync-error") {
    // Synchronous error - propagates immediately
    yield* group("sync-error-demo", function* () {
      console.log("About to throw a synchronous error...");
      throw new Error("Synchronous error - this will fail the test!");
    });
  } else if (DEMO_MODE === "async-error") {
    // Error after an async operation - still propagates
    yield* group("async-error-demo", function* () {
      console.log("Making an HTTP request...");
      yield* http.get("https://test.k6.io");
      console.log("HTTP succeeded, now throwing error...");

      // Even after async operations, errors propagate
      throw new Error("Error after async operation - test fails!");
    });
  } else if (DEMO_MODE === "child-error") {
    // Error in a spawned child task - propagates to parent
    yield* group("child-error-demo", function* () {
      console.log("Spawning a child task that will fail...");

      yield* spawn(function* () {
        yield* sleep(100); // Small delay
        console.log("Child task about to fail...");
        throw new Error("Child task error - parent fails too!");
      });

      // Parent continues working
      console.log("Parent doing work while child runs...");
      yield* http.get("https://test.k6.io");
      console.log("Parent finished its work");

      // But the child error will still fail the test
      yield* sleep(200); // Wait for child to fail
    });
  }

  console.log("\n=== Demo Complete ===");
});
