/**
 * K6 Conformance Test Runner
 *
 * This script runs the Effection conformance tests within K6's Sobek runtime.
 * It validates that all required JavaScript features are available.
 *
 * Usage:
 *   k6 run conformance/k6-runner.ts
 *
 * Or via docker-compose:
 *   docker compose run --rm k6-conformance
 */

import { check } from "k6";
import {
  runSyncTests,
  runAsyncTests,
  printResults,
  allCriticalTestsPassed,
  type ConformanceResults,
} from "./mod.ts";

// K6 options
export const options = {
  vus: 1,
  iterations: 1,
  thresholds: {
    checks: ["rate==1"], // All checks must pass
  },
};

// Setup function runs once before the test
export function setup(): { syncResults: ConformanceResults } {
  console.log("Running synchronous conformance tests...\n");
  const syncResults = runSyncTests();
  return { syncResults };
}

// Default function runs for each VU iteration
export default async function (data: { syncResults: ConformanceResults }): Promise<void> {
  const { syncResults } = data;

  // Run async tests (K6 supports async default function)
  console.log("Running asynchronous conformance tests...\n");
  const asyncResults = await runAsyncTests();

  // Combine results
  const allResults: ConformanceResults = {
    ...syncResults,
    ...asyncResults,
  };

  // Print human-readable results
  printResults(allResults);

  // Convert results to K6 checks
  for (const [name, result] of Object.entries(allResults)) {
    check(result, {
      [`${name}`]: (r: { pass: boolean }) => r.pass,
    });
  }

  // Final summary check
  const criticalPassed = allCriticalTestsPassed(allResults);
  check(criticalPassed, {
    "All critical tests passed (Effection can work)": (v: boolean) => v === true,
  });

  if (!criticalPassed) {
    console.error("\n!!! CRITICAL: Effection cannot work in this runtime !!!");
    console.error("One or more critical conformance tests failed.");
    console.error("Please check the results above for details.");
  }
}

// Teardown function runs once after all iterations
export function teardown(data: { syncResults: ConformanceResults }): void {
  const criticalPassed = allCriticalTestsPassed(data.syncResults);

  if (criticalPassed) {
    console.log("\n=== Conformance testing complete ===");
    console.log("The K6/Sobek runtime appears to support Effection.");
    console.log("You can proceed with using @effectionx/k6 in your tests.");
  }
}
