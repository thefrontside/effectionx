import type { ConformanceResult } from "./types.ts";

/**
 * Test 3: yield* Delegation with Custom Iterables
 *
 * This is CRITICAL for Effection. Effection's Operation<T> pattern uses
 * objects with [Symbol.iterator] that return generators. The yield*
 * operator must correctly delegate to these custom iterables.
 *
 * Tests:
 * - yield* delegates to another generator
 * - yield* delegates to custom [Symbol.iterator] objects
 * - Return value propagates through yield*
 * - Nested yield* delegation works
 * - yield* works with Effection-style Operation pattern
 */
export function testYieldDelegation(): ConformanceResult {
  const checks: string[] = [];

  try {
    // Test basic yield* to another generator
    function* inner(): Generator<number, string, undefined> {
      yield 1;
      yield 2;
      return "inner-done";
    }

    function* outer(): Generator<number, string, undefined> {
      const result = yield* inner();
      yield 3;
      return result;
    }

    const gen = outer();
    const values: number[] = [];
    let result = gen.next();
    while (!result.done) {
      values.push(result.value);
      result = gen.next();
    }

    if (values.length !== 3 || values[0] !== 1 || values[1] !== 2 || values[2] !== 3) {
      return {
        pass: false,
        message: "yield* did not delegate values correctly",
        details: `Expected [1,2,3], got ${JSON.stringify(values)}`,
      };
    }

    if (result.value !== "inner-done") {
      return {
        pass: false,
        message: "yield* did not propagate return value",
        details: `Expected "inner-done", got ${JSON.stringify(result.value)}`,
      };
    }
    checks.push("yield* delegates to generators and propagates return value");

    // Test yield* with custom iterable (Effection-style Operation)
    interface Operation<T> {
      [Symbol.iterator](): Generator<number, T, undefined>;
    }

    function createOperation<T>(value: T): Operation<T> {
      return {
        *[Symbol.iterator](): Generator<number, T, undefined> {
          yield 10;
          yield 20;
          return value;
        },
      };
    }

    function* useOperation(): Generator<number, string, undefined> {
      const result = yield* createOperation("operation-result");
      yield 30;
      return result;
    }

    const opGen = useOperation();
    const opValues: number[] = [];
    let opResult = opGen.next();
    while (!opResult.done) {
      opValues.push(opResult.value);
      opResult = opGen.next();
    }

    if (opValues.length !== 3 || opValues[0] !== 10 || opValues[1] !== 20 || opValues[2] !== 30) {
      return {
        pass: false,
        message: "yield* did not delegate to custom iterable",
        details: `Expected [10,20,30], got ${JSON.stringify(opValues)}`,
      };
    }

    if (opResult.value !== "operation-result") {
      return {
        pass: false,
        message: "yield* did not propagate return value from custom iterable",
        details: `Expected "operation-result", got ${JSON.stringify(opResult.value)}`,
      };
    }
    checks.push("yield* works with custom [Symbol.iterator] objects");

    // Test nested yield* delegation (3 levels deep)
    function* level3(): Generator<string, number, undefined> {
      yield "L3";
      return 3;
    }

    function* level2(): Generator<string, number, undefined> {
      yield "L2-before";
      const result = yield* level3();
      yield "L2-after";
      return result + 2;
    }

    function* level1(): Generator<string, number, undefined> {
      yield "L1-before";
      const result = yield* level2();
      yield "L1-after";
      return result + 1;
    }

    const nestedGen = level1();
    const nestedValues: string[] = [];
    let nestedResult = nestedGen.next();
    while (!nestedResult.done) {
      nestedValues.push(nestedResult.value);
      nestedResult = nestedGen.next();
    }

    const expectedNested = ["L1-before", "L2-before", "L3", "L2-after", "L1-after"];
    if (JSON.stringify(nestedValues) !== JSON.stringify(expectedNested)) {
      return {
        pass: false,
        message: "Nested yield* delegation order incorrect",
        details: `Expected ${JSON.stringify(expectedNested)}, got ${JSON.stringify(nestedValues)}`,
      };
    }

    if (nestedResult.value !== 6) {
      return {
        pass: false,
        message: "Nested yield* return value propagation failed",
        details: `Expected 6 (3+2+1), got ${nestedResult.value}`,
      };
    }
    checks.push("Nested yield* delegation works correctly");

    return {
      pass: true,
      message: "yield* delegation fully supported",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `yield* delegation test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
