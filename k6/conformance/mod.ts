/**
 * Effection K6 Conformance Test Suite
 *
 * This module validates that the K6/Sobek JavaScript runtime supports
 * all the features required for Effection to work correctly.
 *
 * Run these tests before attempting to use Effection in K6 scripts.
 */

import type { ConformanceResult, ConformanceResults } from "./types.ts";
import { testSymbols } from "./01-symbols.ts";
import { testGenerators } from "./02-generators.ts";
import { testYieldDelegation } from "./03-yield-delegation.ts";
import { testYieldThrow } from "./04-yield-throw.ts";
import { testYieldReturn } from "./05-yield-return.ts";
import { testPromises, testPromisesAsync } from "./06-promises.ts";
import { testTimers, testTimersAsync } from "./07-timers.ts";
import { testAbortController, testAbortControllerAsync } from "./08-abort-controller.ts";

export type { ConformanceResult, ConformanceResults };

/**
 * All synchronous conformance tests.
 * These can be run without async/await support.
 */
export const syncTests: Record<string, () => ConformanceResult> = {
  "01-symbols": testSymbols,
  "02-generators": testGenerators,
  "03-yield-delegation": testYieldDelegation,
  "04-yield-throw": testYieldThrow,
  "05-yield-return": testYieldReturn,
  "06-promises-sync": testPromises,
  "07-timers-sync": testTimers,
  "08-abort-controller-sync": testAbortController,
};

/**
 * Async conformance tests.
 * These require async/await and event loop support.
 */
export const asyncTests: Record<string, () => Promise<ConformanceResult>> = {
  "06-promises-async": testPromisesAsync,
  "07-timers-async": testTimersAsync,
  "08-abort-controller-async": testAbortControllerAsync,
};

/**
 * Run all synchronous conformance tests.
 * Returns a record of test names to results.
 */
export function runSyncTests(): ConformanceResults {
  const results: ConformanceResults = {};

  for (const [name, test] of Object.entries(syncTests)) {
    try {
      results[name] = test();
    } catch (error) {
      results[name] = {
        pass: false,
        message: `Test threw unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return results;
}

/**
 * Run all async conformance tests.
 * Returns a promise that resolves to a record of test names to results.
 */
export async function runAsyncTests(): Promise<ConformanceResults> {
  const results: ConformanceResults = {};

  for (const [name, test] of Object.entries(asyncTests)) {
    try {
      results[name] = await test();
    } catch (error) {
      results[name] = {
        pass: false,
        message: `Test threw unexpected error: ${error instanceof Error ? error.message : String(error)}`,
      };
    }
  }

  return results;
}

/**
 * Run all conformance tests (sync and async).
 * Returns a promise that resolves to all results.
 */
export async function runAllTests(): Promise<ConformanceResults> {
  const syncResults = runSyncTests();
  const asyncResults = await runAsyncTests();

  return {
    ...syncResults,
    ...asyncResults,
  };
}

/**
 * Print test results to console in a human-readable format.
 */
export function printResults(results: ConformanceResults): void {
  console.log("\n=== Effection K6 Conformance Test Results ===\n");

  let passed = 0;
  let failed = 0;

  for (const [name, result] of Object.entries(results)) {
    const status = result.pass ? "PASS" : "FAIL";
    const icon = result.pass ? "+" : "x";

    console.log(`[${icon}] ${name}: ${status}`);
    console.log(`    ${result.message}`);
    if (result.details) {
      console.log(`    Details: ${result.details}`);
    }
    console.log("");

    if (result.pass) {
      passed++;
    } else {
      failed++;
    }
  }

  console.log("=== Summary ===");
  console.log(`Passed: ${passed}`);
  console.log(`Failed: ${failed}`);
  console.log(`Total:  ${passed + failed}`);

  if (failed > 0) {
    console.log("\nWARNING: Some conformance tests failed.");
    console.log("Effection may not work correctly in this runtime.");
  } else {
    console.log("\nAll conformance tests passed!");
    console.log("Effection should work correctly in this runtime.");
  }
}

/**
 * Determine if all critical tests passed.
 * Critical tests are those required for Effection to function at all.
 */
export function allCriticalTestsPassed(results: ConformanceResults): boolean {
  const criticalTests = [
    "01-symbols",
    "02-generators",
    "03-yield-delegation",
    "04-yield-throw",
    "05-yield-return",
  ];

  for (const name of criticalTests) {
    if (!results[name]?.pass) {
      return false;
    }
  }

  return true;
}
