import { expect } from "expect";
import { beforeEach, describe, it } from "../testing.ts";
import { createTempDir, type TempDir } from "../testing/temp-dir.ts";
import { setupLogging } from "../testing/logging.ts";
import { runNodeTests } from "./node-test.ts";

describe("Node Test Execution", () => {
  let tempDir: TempDir;

  beforeEach(function* () {
    yield* setupLogging(false);
    tempDir = yield* createTempDir({ prefix: "ex-publisher-node-test-" });
  });

  describe("runNodeTests", () => {
    beforeEach(function* () {
      // Create a basic Node.js package structure with tests
      yield* tempDir.withFiles({
        "package.json": JSON.stringify({
          name: "@effectionx/crystal-magic",
          version: "1.0.0",
          type: "module",
          dependencies: {
            "effection": "3.6.0",
            "picocolors": "^1.0.0",
            "@deno/shim-deno-test": "^0.5.0"
          },
          scripts: {
            test: "node test_runner.js"
          }
        }),
        "esm/mod.js": `
export function spellcast(spell) {
  return "✨ " + spell + " ✨";
}

export function enchant(item) {
  return "🔮 " + item + " 🔮";
}`,
        "esm/mod.test.js": `
import { spellcast, enchant } from "./mod.js";

// Simple test functions
function test(name, fn) {
  try {
    fn();
    console.log("✓ " + name);
    return true;
  } catch (error) {
    console.log("✗ " + name + ": " + error.message);
    return false;
  }
}

let passed = 0;
let failed = 0;

console.log("Crystal Magic Tests");

if (test("should cast spells with sparkles", () => {
  const result = spellcast("fireball");
  if (result !== "✨ fireball ✨") {
    throw new Error("Spell casting failed!");
  }
})) {
  passed++;
} else {
  failed++;
}

if (test("should enchant items with crystal power", () => {
  const result = enchant("sword");
  if (result !== "🔮 sword 🔮") {
    throw new Error("Enchantment failed!");
  }
})) {
  passed++;
} else {
  failed++;
}

if (test("should handle failing spells", () => {
  // This test should fail
  throw new Error("Dark magic detected!");
})) {
  passed++;
} else {
  failed++;
}

console.log(\`\ntest result: \${failed === 0 ? "ok" : "FAILED"}. \${passed} passed; \${failed} failed; 0 ignored; 0 measured; 0 filtered out\`);

if (failed > 0) {
  console.log("failures:");
  console.log("should handle failing spells");
  console.log("thread 'main' panicked at Dark magic detected!");
}`
      });
    });

    it("should execute Node.js tests and return results", function* () {
      const result = yield* runNodeTests({
        packageDir: tempDir.path,
        testPattern: "**/*.test.js"
      });

      expect(result.success).toBe(false); // Should fail due to one failing test
      expect(result.testsRun).toBe(3);
      expect(result.testsPassed).toBe(2);
      expect(result.testsFailed).toBe(1);
      expect(result.testFailures).toHaveLength(1);
      expect(result.testFailures[0].name).toContain("should handle failing spells");
      expect(result.testFailures[0].error).toContain("Dark magic detected!");
    });

    it("should handle successful test runs", function* () {
      // Override the test file with only passing tests
      yield* tempDir.withFiles({
        "esm/mod.test.js": `
import { spellcast, enchant } from "./mod.js";

// Simple test functions
function test(name, fn) {
  try {
    fn();
    console.log("✓ " + name);
    return true;
  } catch (error) {
    console.log("✗ " + name + ": " + error.message);
    return false;
  }
}

let passed = 0;
let failed = 0;

console.log("Crystal Magic Tests");

if (test("should cast spells with sparkles", () => {
  const result = spellcast("fireball");
  if (result !== "✨ fireball ✨") {
    throw new Error("Spell casting failed!");
  }
})) {
  passed++;
} else {
  failed++;
}

if (test("should enchant items with crystal power", () => {
  const result = enchant("sword");
  if (result !== "🔮 sword 🔮") {
    throw new Error("Enchantment failed!");
  }
})) {
  passed++;
} else {
  failed++;
}

console.log(\`\ntest result: \${failed === 0 ? "ok" : "FAILED"}. \${passed} passed; \${failed} failed; 0 ignored; 0 measured; 0 filtered out\`);`
      });

      const result = yield* runNodeTests({
        packageDir: tempDir.path,
        testPattern: "**/*.test.js"
      });

      expect(result.success).toBe(true);
      expect(result.testsRun).toBe(2);
      expect(result.testsPassed).toBe(2);
      expect(result.testsFailed).toBe(0);
      expect(result.testFailures).toHaveLength(0);
      expect(result.exitCode).toBe(0);
    });

    it("should discover tests using custom patterns", function* () {
      // Add tests with different naming patterns
      yield* tempDir.withFiles({
        "esm/spell_test.js": `
console.log("Spell Tests");
console.log("✓ should work with underscore naming");
console.log("\\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out");`,
        "esm/test.js": `
console.log("Basic Tests");
console.log("✓ should work with test.js naming");
console.log("\\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out");`
      });

      const result = yield* runNodeTests({
        packageDir: tempDir.path,
        testPattern: "**/{*_test.js,test.js,*.test.js}"
      });

      expect(result.testsRun).toBe(5); // 3 from mod.test.js + 1 from spell_test.js + 1 from test.js  
      expect(result.testsPassed).toBe(4); // All should pass except the failing one
      expect(result.testsFailed).toBe(1); // The intentionally failing test
    });

    it("should handle packages without tests", function* () {
      // Create a separate temp directory for this test to avoid beforeEach files
      const emptyTempDir = yield* createTempDir({ prefix: "ex-publisher-empty-test-" });
      
      // Create package with no test files
      yield* emptyTempDir.withFiles({
        "package.json": JSON.stringify({
          name: "@effectionx/empty-package",
          version: "1.0.0",
          type: "module",
          dependencies: {
            "picocolors": "^1.0.0"
          }
        }),
        "esm/mod.js": `export const magic = "✨";`
      });

      const result = yield* runNodeTests({
        packageDir: emptyTempDir.path,
        testPattern: "**/*.test.js"
      });

      expect(result.success).toBe(true);
      expect(result.testsRun).toBe(0);
      expect(result.testsPassed).toBe(0);
      expect(result.testsFailed).toBe(0);
      expect(result.exitCode).toBe(0);
    });

    it("should handle Node.js execution errors", function* () {
      // Create a package with broken syntax
      yield* tempDir.withFiles({
        "package.json": JSON.stringify({
          name: "@effectionx/broken-package",
          version: "1.0.0",
          type: "module",
          dependencies: {
            "picocolors": "^1.0.0"
          }
        }),
        "esm/broken.test.js": `
console.log("Broken Test");
// Invalid JavaScript syntax
const broken = }; 
console.log("This should not run");`
      });

      const result = yield* runNodeTests({
        packageDir: tempDir.path,
        testPattern: "**/broken.test.js"
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stderr).toMatch(/SyntaxError|Unexpected token/);
    });

    it("should work with different working directories", function* () {
      const customTestDir = `${tempDir.path}/tests`;
      
      yield* tempDir.withFiles({
        "package.json": JSON.stringify({
          name: "@effectionx/custom-dir-package",
          version: "1.0.0",
          type: "module",
          dependencies: {
            "picocolors": "^1.0.0"
          }
        }),
        "tests/magic.test.js": `
console.log("Custom Directory Tests");
console.log("✓ should run from custom test directory");
console.log("\\ntest result: ok. 1 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out");`
      });

      const result = yield* runNodeTests({
        packageDir: tempDir.path,
        testPattern: "**/*.test.js",
        rootTestDir: customTestDir
      });

      expect(result.success).toBe(true);
      expect(result.testsRun).toBe(1);
      expect(result.testsPassed).toBe(1);
    });
  });
});