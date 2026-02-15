import type { ConformanceResult } from "./types.ts";

/**
 * Test 5: yield* return() Forwarding (Cancellation Semantics)
 *
 * CRITICAL for Effection's cancellation and cleanup. When return() is
 * called on a generator that is delegating via yield*, the return must
 * be forwarded to the delegated generator, allowing finally blocks to
 * execute for proper cleanup.
 *
 * Tests:
 * - return() is forwarded to delegated generator
 * - finally blocks execute on return()
 * - Nested finally blocks execute in correct order (LIFO)
 * - return() value is propagated correctly
 */
export function testYieldReturn(): ConformanceResult {
  const checks: string[] = [];

  try {
    // Test 1: return() forwarded to delegated generator's finally
    let innerFinallyRan = false;

    function* innerWithFinally(): Generator<string, string, undefined> {
      try {
        yield "inner-1";
        yield "inner-2";
        return "inner-done";
      } finally {
        innerFinallyRan = true;
      }
    }

    function* outerDelegating(): Generator<string, string, undefined> {
      const result = yield* innerWithFinally();
      return result;
    }

    const gen1 = outerDelegating();
    gen1.next(); // yield "inner-1"
    const returnResult = gen1.return("early-return");

    if (!innerFinallyRan) {
      return {
        pass: false,
        message: "return() did not trigger finally in delegated generator",
        details: "This is CRITICAL for Effection cleanup semantics",
      };
    }

    if (returnResult.done !== true) {
      return {
        pass: false,
        message: "return() did not complete the generator",
      };
    }
    checks.push("return() triggers finally in delegated generator");

    // Test 2: Nested finally blocks execute in LIFO order
    const finallyOrder: string[] = [];

    function* level3Finally(): Generator<string, string, undefined> {
      try {
        yield "L3";
        return "L3-done";
      } finally {
        finallyOrder.push("L3-finally");
      }
    }

    function* level2Finally(): Generator<string, string, undefined> {
      try {
        const result = yield* level3Finally();
        yield "L2-after";
        return result;
      } finally {
        finallyOrder.push("L2-finally");
      }
    }

    function* level1Finally(): Generator<string, string, undefined> {
      try {
        const result = yield* level2Finally();
        yield "L1-after";
        return result;
      } finally {
        finallyOrder.push("L1-finally");
      }
    }

    const gen2 = level1Finally();
    gen2.next(); // yield "L3"
    gen2.return("cancelled");

    // Finally blocks should execute from innermost to outermost (LIFO)
    // This matches Effection's scope cleanup order
    if (finallyOrder.length !== 3) {
      return {
        pass: false,
        message: "Not all finally blocks executed",
        details: `Expected 3, got ${finallyOrder.length}: ${JSON.stringify(finallyOrder)}`,
      };
    }

    // LIFO order: L3 -> L2 -> L1
    if (finallyOrder[0] !== "L3-finally") {
      return {
        pass: false,
        message: "Innermost finally did not run first",
        details: `Expected L3-finally first, got: ${JSON.stringify(finallyOrder)}`,
      };
    }

    if (finallyOrder[2] !== "L1-finally") {
      return {
        pass: false,
        message: "Outermost finally did not run last",
        details: `Expected L1-finally last, got: ${JSON.stringify(finallyOrder)}`,
      };
    }
    checks.push("Nested finally blocks execute in LIFO order");

    // Test 3: finally can yield (important for async cleanup)
    let cleanupYielded = false;

    function* withCleanupYield(): Generator<string, string, undefined> {
      try {
        yield "working";
        return "done";
      } finally {
        yield "cleanup";
        cleanupYielded = true;
      }
    }

    function* useCleanupYield(): Generator<string, string, undefined> {
      const result = yield* withCleanupYield();
      return result;
    }

    const gen3 = useCleanupYield();
    gen3.next(); // yield "working"
    const cleanupResult1 = gen3.return("cancel");

    // The finally block should be able to yield "cleanup"
    if (cleanupResult1.value !== "cleanup" || cleanupResult1.done !== false) {
      return {
        pass: false,
        message: "finally block yield not executed during return()",
        details: `Expected {value: "cleanup", done: false}, got ${JSON.stringify(cleanupResult1)}`,
      };
    }

    // Continue past the cleanup yield
    const cleanupResult2 = gen3.next();

    if (!cleanupYielded) {
      return {
        pass: false,
        message: "finally block did not complete after yield",
      };
    }

    if (cleanupResult2.done !== true) {
      return {
        pass: false,
        message: "Generator did not complete after finally yield",
      };
    }
    checks.push("finally blocks can yield during cleanup");

    return {
      pass: true,
      message: "yield* return() forwarding fully supported (cancellation semantics OK)",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `yield* return test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
