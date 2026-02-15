/**
 * @effectionx/k6/testing - BDD Testing for K6 with Effection
 *
 * Provides BDD-style testing primitives (describe, it, beforeEach)
 * that work with Effection's structured concurrency and report results via
 * K6's check() function.
 *
 * @example
 * ```typescript
 * import { testMain, describe, it, expect } from "@effectionx/k6/testing";
 * import { group, useGroups, http } from "@effectionx/k6";
 *
 * export default testMain(function*() {
 *   describe("Group Context", () => {
 *     it("preserves context across HTTP calls", function*() {
 *       yield* group("api-tests");
 *       yield* http.get("https://test.k6.io");
 *       const groups = yield* useGroups();
 *       expect(groups).toContain("api-tests");
 *     });
 *   });
 *   // runTests() is called automatically at the end
 * });
 * ```
 *
 * @packageDocumentation
 */

import { check } from "k6";
import { createTestAdapter, type TestAdapter } from "@effectionx/test-adapter";
import { run, type Operation, type Result } from "effection";
import { initTags } from "../lib/tags.ts";

/**
 * Registered test to be executed
 */
interface PendingTest {
  /** Full test name (describe path + it description) */
  fullName: string;
  /** Test description from it() */
  description: string;
  /** Test body - an Effection Operation */
  body: () => Operation<void>;
  /** The adapter that owns this test (for setup/teardown) */
  adapter: TestAdapter;
  /** Whether this test should be skipped */
  skip?: boolean;
}

// Current adapter in the describe() stack
let currentAdapter: TestAdapter | undefined;

// All registered tests, collected during describe() execution
const pendingTests: PendingTest[] = [];

// Track describe path for full test names
const describeStack: string[] = [];

function isDebugEnabled(): boolean {
  const env = (globalThis as Record<string, unknown>).__ENV as
    | Record<string, string>
    | undefined;
  return env?.EFFECTIONX_K6_TEST_DEBUG === "1";
}

/**
 * Define a test suite. Can be nested.
 *
 * @example
 * ```typescript
 * describe("HTTP", () => {
 *   describe("GET requests", () => {
 *     it("returns 200 for valid endpoints", function*() {
 *       // test code
 *     });
 *   });
 * });
 * ```
 */
export function describe(name: string, body: () => void): void {
  const parent = currentAdapter;
  const child = createTestAdapter({ name, parent });

  describeStack.push(name);
  currentAdapter = child;

  try {
    body(); // Synchronously register tests
  } finally {
    describeStack.pop();
    currentAdapter = parent;
  }
}

describe.skip = function skip(name: string, body: () => void): void {
  const parent = currentAdapter;
  const child = createTestAdapter({ name, parent });

  describeStack.push(name);
  currentAdapter = child;

  // Mark all tests in this describe as skipped by temporarily overriding it
  const savedIt = it;
  try {
    // Override it to always skip
    (globalThis as Record<string, unknown>)._skipAllTests = true;
    body();
  } finally {
    (globalThis as Record<string, unknown>)._skipAllTests = false;
    describeStack.pop();
    currentAdapter = parent;
  }
};

describe.only = function only(name: string, body: () => void): void {
  // For now, only() just runs normally - full implementation would filter others
  describe(name, body);
};

/**
 * Define a test case.
 *
 * @example
 * ```typescript
 * it("should handle async operations", function*() {
 *   const response = yield* http.get("https://test.k6.io");
 *   expect(response.status).toBe(200);
 * });
 * ```
 */
export function it(desc: string, body?: () => Operation<void>): void {
  if (!currentAdapter) {
    throw new Error("it() must be called within a describe() block");
  }

  const fullName = [...describeStack, desc].join(" > ");
  const shouldSkip =
    (globalThis as Record<string, unknown>)._skipAllTests === true;

  if (!body || shouldSkip) {
    // Test without body is pending/todo
    pendingTests.push({
      fullName,
      description: desc,
      body: function* () {},
      adapter: currentAdapter,
      skip: true,
    });
    return;
  }

  pendingTests.push({
    fullName,
    description: desc,
    body,
    adapter: currentAdapter,
  });
}

it.skip = function skip(desc: string, _body?: () => Operation<void>): void {
  if (!currentAdapter) {
    throw new Error("it.skip() must be called within a describe() block");
  }

  const fullName = [...describeStack, desc].join(" > ");
  pendingTests.push({
    fullName,
    description: desc,
    body: function* () {},
    adapter: currentAdapter,
    skip: true,
  });
};

it.only = function only(desc: string, body: () => Operation<void>): void {
  // For now, only() just runs normally - full implementation would filter others
  it(desc, body);
};

/**
 * Run setup before each test in the current describe block.
 *
 * Use `resource` or `ensure` within `beforeEach` for setup that needs cleanup.
 * This ensures proper structured concurrency semantics with per-test isolation.
 *
 * @example
 * ```typescript
 * describe("Tests", () => {
 *   beforeEach(function*() {
 *     yield* group("test-group");
 *   });
 *
 *   it("has group set", function*() {
 *     const groups = yield* useGroups();
 *     expect(groups).toContain("test-group");
 *   });
 * });
 * ```
 */
export function beforeEach(body: () => Operation<void>): void {
  if (!currentAdapter) {
    throw new Error("beforeEach() must be called within a describe() block");
  }
  currentAdapter.addSetup(body);
}

/**
 * Test result from running a single test
 */
export interface TestResult {
  name: string;
  passed: boolean;
  skipped: boolean;
  error?: Error;
  duration: number;
}

/**
 * Summary of all test results
 */
export interface TestSummary {
  total: number;
  passed: number;
  failed: number;
  skipped: number;
  results: TestResult[];
}

/**
 * Run all registered tests and report results via K6 checks.
 *
 * This is an Effection Operation that should be yielded at the end
 * of your main() function.
 *
 * @example
 * ```typescript
 * export default main(function*() {
 *   describe("My Tests", () => {
 *     it("works", function*() {
 *       // test
 *     });
 *   });
 *
 *   const summary = yield* runTests();
 *   console.log(`Passed: ${summary.passed}/${summary.total}`);
 * });
 * ```
 */
export function* runTests(): Operation<TestSummary> {
  const results: TestResult[] = [];
  const adaptersToDestroy = new Set<TestAdapter>();
  const debug = isDebugEnabled();

  for (const test of pendingTests) {
    // Collect all adapters for cleanup
    for (
      let adapter: TestAdapter | undefined = test.adapter;
      adapter;
      adapter = adapter.parent
    ) {
      adaptersToDestroy.add(adapter);
    }

    if (test.skip) {
      // Report skipped test
      results.push({
        name: test.fullName,
        passed: false,
        skipped: true,
        duration: 0,
      });

      // K6 check for skipped (we mark it as passing but note it's skipped)
      check(null, {
        [`[SKIP] ${test.fullName}`]: () => true,
      });

      continue;
    }

    const startTime = Date.now();
    let passed = false;
    let error: Error | undefined;

    if (debug) {
      console.log(`[effectionx/k6/testing] START ${test.fullName}`);
    }

    try {
      // Run the test through the adapter - Future extends Operation so we can yield* directly
      const result: Result<void> = yield* test.adapter.runTest(test.body);

      if (result.ok) {
        passed = true;
      } else {
        passed = false;
        error = result.error as Error;
      }
    } catch (e) {
      passed = false;
      error = e instanceof Error ? e : new Error(String(e));
    }

    const duration = Date.now() - startTime;

    if (debug) {
      console.log(
        `[effectionx/k6/testing] END ${test.fullName} passed=${passed} duration=${duration}ms`,
      );
    }

    results.push({
      name: test.fullName,
      passed,
      skipped: false,
      error,
      duration,
    });

    // Report via K6 check
    check(null, {
      [test.fullName]: () => passed,
    });

    // Log failure details
    if (!passed && error) {
      console.error(`\n✗ ${test.fullName}`);
      console.error(`  Error: ${error.message}`);
      if (error.stack) {
        console.error(
          `  Stack: ${error.stack.split("\n").slice(1, 4).join("\n")}`,
        );
      }
    }
  }

  // Cleanup all adapters - Future extends Operation so we can yield* directly
  for (const adapter of adaptersToDestroy) {
    try {
      yield* adapter.destroy();
    } catch {
      // Ignore cleanup errors
    }
  }

  // Clear pending tests for next iteration
  pendingTests.length = 0;

  // Calculate summary
  const summary: TestSummary = {
    total: results.length,
    passed: results.filter((r) => r.passed && !r.skipped).length,
    failed: results.filter((r) => !r.passed && !r.skipped).length,
    skipped: results.filter((r) => r.skipped).length,
    results,
  };

  // Log summary
  console.log(`\n=== Test Summary ===`);
  console.log(`Total:   ${summary.total}`);
  console.log(`Passed:  ${summary.passed}`);
  console.log(`Failed:  ${summary.failed}`);
  console.log(`Skipped: ${summary.skipped}`);

  return summary;
}

/**
 * Wraps a test suite as a K6 VU iteration function.
 *
 * This combines:
 * - Effection runtime setup (like `main()`)
 * - K6 tags initialization
 * - Automatic `runTests()` execution at the end
 *
 * Use this as your K6 default export for test files.
 *
 * @param makeOp - Factory function that registers tests via describe/it.
 *                 Called fresh for each VU iteration.
 * @returns An async function suitable as K6's default export.
 *
 * @example
 * ```typescript
 * import { testMain, describe, it, expect } from "@effectionx/k6/testing";
 * import { group, useGroups } from "@effectionx/k6";
 *
 * export default testMain(function*() {
 *   describe("My Tests", () => {
 *     it("works", function*() {
 *       yield* group("test");
 *       const groups = yield* useGroups();
 *       expect(groups).toContain("test");
 *     });
 *   });
 *   // runTests() called automatically
 * });
 * ```
 */
export function testMain(makeOp: () => Operation<void>) {
  return function iteration() {
    return run(function* () {
      // Initialize K6 tags context
      yield* initTags();

      // Run the test registration operation
      yield* makeOp();

      // Automatically run all registered tests
      yield* runTests();
    });
  };
}

/**
 * Simple expect() helper for assertions within tests.
 * Throws an error if the assertion fails.
 */
export function expect<T>(actual: T): Expectation<T> {
  return new Expectation(actual);
}

class Expectation<T> {
  private actual: T;
  constructor(actual: T) {
    this.actual = actual;
  }

  toBe(expected: T): void {
    if (this.actual !== expected) {
      throw new Error(
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(this.actual)}`,
      );
    }
  }

  toEqual(expected: T): void {
    if (JSON.stringify(this.actual) !== JSON.stringify(expected)) {
      throw new Error(
        `Expected ${JSON.stringify(expected)}, got ${JSON.stringify(this.actual)}`,
      );
    }
  }

  toBeTruthy(): void {
    if (!this.actual) {
      throw new Error(
        `Expected truthy value, got ${JSON.stringify(this.actual)}`,
      );
    }
  }

  toBeFalsy(): void {
    if (this.actual) {
      throw new Error(
        `Expected falsy value, got ${JSON.stringify(this.actual)}`,
      );
    }
  }

  toContain(item: T extends Array<infer U> ? U : never): void {
    if (!Array.isArray(this.actual) || !this.actual.includes(item)) {
      throw new Error(
        `Expected ${JSON.stringify(this.actual)} to contain ${JSON.stringify(item)}`,
      );
    }
  }

  toHaveLength(length: number): void {
    const actualLength = (this.actual as unknown as { length: number }).length;
    if (actualLength !== length) {
      throw new Error(`Expected length ${length}, got ${actualLength}`);
    }
  }

  toBeGreaterThan(expected: number): void {
    if (typeof this.actual !== "number" || this.actual <= expected) {
      throw new Error(`Expected ${this.actual} to be greater than ${expected}`);
    }
  }

  toBeLessThan(expected: number): void {
    if (typeof this.actual !== "number" || this.actual >= expected) {
      throw new Error(`Expected ${this.actual} to be less than ${expected}`);
    }
  }

  toThrow(message?: string | RegExp): void {
    if (typeof this.actual !== "function") {
      throw new Error("toThrow() requires a function");
    }
    let threw = false;
    let error: Error | undefined;
    try {
      (this.actual as () => void)();
    } catch (e) {
      threw = true;
      error = e instanceof Error ? e : new Error(String(e));
    }
    if (!threw) {
      throw new Error("Expected function to throw");
    }
    if (message && error) {
      if (typeof message === "string" && !error.message.includes(message)) {
        throw new Error(
          `Expected error message to include "${message}", got "${error.message}"`,
        );
      }
      if (message instanceof RegExp && !message.test(error.message)) {
        throw new Error(
          `Expected error message to match ${message}, got "${error.message}"`,
        );
      }
    }
  }

  not = {
    toBe: (expected: T): void => {
      if (this.actual === expected) {
        throw new Error(
          `Expected ${JSON.stringify(this.actual)} not to be ${JSON.stringify(expected)}`,
        );
      }
    },
    toEqual: (expected: T): void => {
      if (JSON.stringify(this.actual) === JSON.stringify(expected)) {
        throw new Error(
          `Expected ${JSON.stringify(this.actual)} not to equal ${JSON.stringify(expected)}`,
        );
      }
    },
    toContain: (item: T extends Array<infer U> ? U : never): void => {
      if (Array.isArray(this.actual) && this.actual.includes(item)) {
        throw new Error(
          `Expected ${JSON.stringify(this.actual)} not to contain ${JSON.stringify(item)}`,
        );
      }
    },
  };
}
