import type { ConformanceResult } from "./types.ts";

/**
 * Test 2: Basic Generator Support
 *
 * Validates that the runtime supports ES6 generators, which are the
 * foundation of Effection's execution model.
 *
 * Tests:
 * - Generator function syntax works
 * - yield returns values correctly
 * - Generator iteration works
 * - Generator return() method exists and works
 * - Generator throw() method exists and works
 * - Generator can return final value
 */
export function testGenerators(): ConformanceResult {
  const checks: string[] = [];

  try {
    // Test basic generator function
    function* basicGenerator(): Generator<number, string, undefined> {
      yield 1;
      yield 2;
      yield 3;
      return "done";
    }

    const gen = basicGenerator();
    checks.push("Generator function syntax works");

    // Test yield values
    let result = gen.next();
    if (result.value !== 1 || result.done !== false) {
      return {
        pass: false,
        message: "First yield did not return expected value",
        details: `Expected {value: 1, done: false}, got ${JSON.stringify(result)}`,
      };
    }

    result = gen.next();
    if (result.value !== 2) {
      return {
        pass: false,
        message: "Second yield did not return expected value",
      };
    }

    result = gen.next();
    if (result.value !== 3) {
      return {
        pass: false,
        message: "Third yield did not return expected value",
      };
    }
    checks.push("yield returns values correctly");

    // Test generator completion with return value
    result = gen.next();
    if (result.done !== true || result.value !== "done") {
      return {
        pass: false,
        message: "Generator return value not received",
        details: `Expected {value: "done", done: true}, got ${JSON.stringify(result)}`,
      };
    }
    checks.push("Generator return value works");

    // Test generator return() method
    function* returnableGen(): Generator<number, string, undefined> {
      yield 1;
      yield 2;
      yield 3;
      return "completed";
    }

    const gen2 = returnableGen();
    gen2.next(); // consume first value
    const returnResult = gen2.return("early");
    if (returnResult.done !== true || returnResult.value !== "early") {
      return {
        pass: false,
        message: "Generator return() method did not work correctly",
        details: `Expected {value: "early", done: true}, got ${JSON.stringify(returnResult)}`,
      };
    }
    checks.push("Generator return() method works");

    // Test generator throw() method
    function* throwableGen(): Generator<number, void, undefined> {
      try {
        yield 1;
        yield 2;
      } catch (_e) {
        yield 99; // yield error indicator
      }
    }

    const gen3 = throwableGen();
    gen3.next(); // consume first value
    const throwResult = gen3.throw(new Error("test error"));
    if (throwResult.value !== 99) {
      return {
        pass: false,
        message: "Generator throw() method did not trigger catch block",
        details: `Expected yield 99, got ${JSON.stringify(throwResult)}`,
      };
    }
    checks.push("Generator throw() method works");

    // Test for...of iteration
    function* iterableGen(): Generator<number> {
      yield 1;
      yield 2;
      yield 3;
    }

    const values: number[] = [];
    for (const v of iterableGen()) {
      values.push(v);
    }
    if (values.length !== 3 || values[0] !== 1 || values[2] !== 3) {
      return {
        pass: false,
        message: "for...of iteration did not work",
        details: `Expected [1,2,3], got ${JSON.stringify(values)}`,
      };
    }
    checks.push("for...of iteration works");

    return {
      pass: true,
      message: "Full generator support confirmed",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `Generator test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
