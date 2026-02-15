import type { ConformanceResult } from "./types.ts";

/**
 * Test 1: Symbol Support
 *
 * Validates that the runtime has proper Symbol support, which is required
 * for Effection's iterator-based Operation pattern.
 *
 * Tests:
 * - Symbol constructor exists
 * - Symbol.iterator is a symbol
 * - Symbol.toStringTag is a symbol (used for debugging)
 * - Custom symbols can be created
 * - Symbols work as object keys
 */
export function testSymbols(): ConformanceResult {
  const checks: string[] = [];

  try {
    // Check Symbol constructor exists
    if (typeof Symbol !== "function") {
      return {
        pass: false,
        message: "Symbol constructor does not exist",
      };
    }
    checks.push("Symbol constructor exists");

    // Check Symbol.iterator
    if (typeof Symbol.iterator !== "symbol") {
      return {
        pass: false,
        message: "Symbol.iterator is not a symbol",
        details: `typeof Symbol.iterator = ${typeof Symbol.iterator}`,
      };
    }
    checks.push("Symbol.iterator is a symbol");

    // Check Symbol.toStringTag (used for debugging output)
    if (typeof Symbol.toStringTag !== "symbol") {
      return {
        pass: false,
        message: "Symbol.toStringTag is not a symbol",
        details: `typeof Symbol.toStringTag = ${typeof Symbol.toStringTag}`,
      };
    }
    checks.push("Symbol.toStringTag is a symbol");

    // Test custom symbol creation
    const customSymbol = Symbol("test");
    if (typeof customSymbol !== "symbol") {
      return {
        pass: false,
        message: "Cannot create custom symbols",
      };
    }
    checks.push("Custom symbol creation works");

    // Test symbol as object key
    const obj: Record<symbol, string> = {};
    obj[customSymbol] = "value";
    if (obj[customSymbol] !== "value") {
      return {
        pass: false,
        message: "Symbols do not work as object keys",
      };
    }
    checks.push("Symbols work as object keys");

    // Test Symbol.for (global symbol registry)
    const globalSym1 = Symbol.for("global.test");
    const globalSym2 = Symbol.for("global.test");
    // Use Object.is to avoid TypeScript's strict equality check on unique symbols
    if (!Object.is(globalSym1, globalSym2)) {
      return {
        pass: false,
        message: "Symbol.for does not return same symbol for same key",
      };
    }
    checks.push("Symbol.for works correctly");

    return {
      pass: true,
      message: "Full Symbol support confirmed",
      details: checks.join("; "),
    };
  } catch (error) {
    return {
      pass: false,
      message: `Symbol test threw error: ${error instanceof Error ? error.message : String(error)}`,
    };
  }
}
