import type { ConformanceResult } from "./types.ts";

/**
 * Test 6: Promise and Microtask Support
 *
 * Validates Promise support and microtask scheduling, which is important
 * for Effection's integration with async operations and the host event loop.
 *
 * Tests:
 * - Promise constructor works
 * - Promise.resolve/reject work
 * - Promise.then chains correctly
 * - Promise.all/race work
 * - Microtasks run before next macrotask (if testable synchronously)
 * - async/await syntax works
 */
export function testPromises(): ConformanceResult {
  const checks: string[] = [];

  try {
    // Test Promise constructor exists
    if (typeof Promise !== "function") {
      return {
        pass: false,
        message: "Promise constructor does not exist",
      };
    }
    checks.push("Promise constructor exists");

    // Test Promise.resolve
    const resolved = Promise.resolve(42);
    if (!(resolved instanceof Promise)) {
      return {
        pass: false,
        message: "Promise.resolve did not return a Promise",
      };
    }
    checks.push("Promise.resolve works");

    // Test Promise.reject
    const rejected = Promise.reject(new Error("test"));
    if (!(rejected instanceof Promise)) {
      return {
        pass: false,
        message: "Promise.reject did not return a Promise",
      };
    }
    // Prevent unhandled rejection
    rejected.catch(() => {});
    checks.push("Promise.reject works");

    // Test Promise constructor with executor
    let executorRan = false;
    const _constructed = new Promise<void>((resolve) => {
      executorRan = true;
      resolve();
    });

    if (!executorRan) {
      return {
        pass: false,
        message: "Promise executor did not run synchronously",
      };
    }
    checks.push("Promise executor runs synchronously");

    // Test Promise.all exists
    if (typeof Promise.all !== "function") {
      return {
        pass: false,
        message: "Promise.all does not exist",
      };
    }
    checks.push("Promise.all exists");

    // Test Promise.race exists
    if (typeof Promise.race !== "function") {
      return {
        pass: false,
        message: "Promise.race does not exist",
      };
    }
    checks.push("Promise.race exists");

    // Test Promise.allSettled exists (ES2020)
    if (typeof Promise.allSettled !== "function") {
      // Not critical, just note it
      checks.push("Promise.allSettled not available (ES2020)");
    } else {
      checks.push("Promise.allSettled exists");
    }

    // Test async function syntax (will be checked at parse time)
    // If this file loads, async functions are supported
    const asyncFn = async () => 42;
    if (typeof asyncFn !== "function") {
      return {
        pass: false,
        message: "async function syntax not supported",
      };
    }
    checks.push("async function syntax works");

    // Test that async function returns Promise
    const asyncResult = asyncFn();
    if (!(asyncResult instanceof Promise)) {
      return {
        pass: false,
        message: "async function did not return Promise",
      };
    }
    checks.push("async functions return Promises");

    return {
      pass: true,
      message: "Promise support confirmed",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `Promise test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}

/**
 * Async version of Promise tests that actually await results.
 * This should be run separately if the runtime supports async test execution.
 */
export async function testPromisesAsync(): Promise<ConformanceResult> {
  const checks: string[] = [];

  try {
    // Test Promise.resolve value
    const value = await Promise.resolve(42);
    if (value !== 42) {
      return {
        pass: false,
        message: "Promise.resolve did not resolve to correct value",
      };
    }
    checks.push("await Promise.resolve works");

    // Test Promise.then chaining
    const chained = await Promise.resolve(1)
      .then((x) => x + 1)
      .then((x) => x + 1);
    if (chained !== 3) {
      return {
        pass: false,
        message: "Promise.then chaining did not work",
        details: `Expected 3, got ${chained}`,
      };
    }
    checks.push("Promise.then chaining works");

    // Test Promise.all
    const allResults = await Promise.all([
      Promise.resolve(1),
      Promise.resolve(2),
      Promise.resolve(3),
    ]);
    if (allResults.length !== 3 || allResults[0] !== 1 || allResults[2] !== 3) {
      return {
        pass: false,
        message: "Promise.all did not collect all values",
        details: `Expected [1,2,3], got ${JSON.stringify(allResults)}`,
      };
    }
    checks.push("Promise.all works");

    // Test Promise.race
    const raceResult = await Promise.race([
      Promise.resolve("first"),
      new Promise((resolve) => setTimeout(() => resolve("second"), 100)),
    ]);
    if (raceResult !== "first") {
      return {
        pass: false,
        message: "Promise.race did not return first resolved value",
      };
    }
    checks.push("Promise.race works");

    // Test async/await with try/catch
    let caughtError = false;
    try {
      await Promise.reject(new Error("test error"));
    } catch (_e) {
      caughtError = true;
    }
    if (!caughtError) {
      return {
        pass: false,
        message: "async/await try/catch did not catch rejection",
      };
    }
    checks.push("async/await try/catch works");

    return {
      pass: true,
      message: "Full async Promise support confirmed",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `Async Promise test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
