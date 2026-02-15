import type { ConformanceResult } from "./types.ts";

/**
 * Test 4: yield* throw() Forwarding
 *
 * Critical for Effection's error propagation. When an error is thrown
 * into a generator that is delegating via yield*, the error must be
 * forwarded to the delegated generator's throw() method.
 *
 * Tests:
 * - Errors thrown into outer generator reach inner generator
 * - try/catch in delegated generator catches forwarded errors
 * - Uncaught errors in delegated generator bubble up
 * - Error propagation works across multiple delegation levels
 */
export function testYieldThrow(): ConformanceResult {
  const checks: string[] = [];

  try {
    // Test 1: Error forwarding to delegated generator with catch
    let innerCaughtError = false;

    function* innerWithCatch(): Generator<string, string, undefined> {
      try {
        yield "inner-1";
        yield "inner-2";
        return "inner-done";
      } catch (_e) {
        innerCaughtError = true;
        return "inner-caught";
      }
    }

    function* outerDelegating(): Generator<string, string, undefined> {
      const result = yield* innerWithCatch();
      return result;
    }

    const gen1 = outerDelegating();
    gen1.next(); // yield "inner-1"
    const throwResult = gen1.throw(new Error("test error"));

    if (!innerCaughtError) {
      return {
        pass: false,
        message: "Error was not forwarded to delegated generator",
      };
    }

    if (throwResult.value !== "inner-caught" || throwResult.done !== true) {
      return {
        pass: false,
        message: "Delegated generator catch block return value not propagated",
        details: `Expected {value: "inner-caught", done: true}, got ${JSON.stringify(throwResult)}`,
      };
    }
    checks.push("Error forwarding to delegated generator works");

    // Test 2: Uncaught error in delegated generator bubbles up
    function* innerNoCatch(): Generator<string, string, undefined> {
      yield "will-throw";
      return "never-reached";
    }

    function* outerCatching(): Generator<string, string, undefined> {
      try {
        const result = yield* innerNoCatch();
        return result;
      } catch (_e) {
        return "outer-caught";
      }
    }

    const gen2 = outerCatching();
    gen2.next(); // yield "will-throw"
    const bubbleResult = gen2.throw(new Error("bubble error"));

    if (bubbleResult.value !== "outer-caught" || bubbleResult.done !== true) {
      return {
        pass: false,
        message: "Uncaught error did not bubble to outer generator",
        details: `Expected {value: "outer-caught", done: true}, got ${JSON.stringify(bubbleResult)}`,
      };
    }
    checks.push("Uncaught errors bubble up through yield*");

    // Test 3: Error propagation across 3 levels
    const errorPath: string[] = [];

    function* level3Throw(): Generator<string, string, undefined> {
      try {
        yield "L3";
        return "L3-done";
      } catch (_e) {
        errorPath.push("L3-catch");
        throw _e; // re-throw
      }
    }

    function* level2Throw(): Generator<string, string, undefined> {
      try {
        const result = yield* level3Throw();
        return result;
      } catch (_e) {
        errorPath.push("L2-catch");
        throw _e; // re-throw
      }
    }

    function* level1Throw(): Generator<string, string, undefined> {
      try {
        const result = yield* level2Throw();
        return result;
      } catch (_e) {
        errorPath.push("L1-catch");
        return "L1-recovered";
      }
    }

    const gen3 = level1Throw();
    gen3.next(); // yield "L3"
    const multiLevelResult = gen3.throw(new Error("multi-level error"));

    // Error should have propagated through L3 -> L2 -> L1 (caught)
    if (errorPath.length !== 3) {
      return {
        pass: false,
        message: "Error did not propagate through all levels",
        details: `Expected 3 catches, got: ${JSON.stringify(errorPath)}`,
      };
    }

    if (
      errorPath[0] !== "L3-catch" ||
      errorPath[1] !== "L2-catch" ||
      errorPath[2] !== "L1-catch"
    ) {
      return {
        pass: false,
        message: "Error propagation order incorrect",
        details: `Expected [L3-catch, L2-catch, L1-catch], got ${JSON.stringify(errorPath)}`,
      };
    }

    if (
      multiLevelResult.value !== "L1-recovered" ||
      multiLevelResult.done !== true
    ) {
      return {
        pass: false,
        message: "Final recovery value not correct",
        details: `Expected {value: "L1-recovered", done: true}, got ${JSON.stringify(multiLevelResult)}`,
      };
    }
    checks.push("Error propagation works across multiple delegation levels");

    return {
      pass: true,
      message: "yield* throw() forwarding fully supported",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `yield* throw test threw unexpected error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
