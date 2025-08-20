import { expect } from "expect";
import { beforeEach, describe, it } from "../testing.ts";
import { createTempDir } from "../testing/temp-dir.ts";
import { setupLogging } from "../testing/logging.ts";
import { runVerification } from "./verify.ts";
import type { DiscoveredExtension } from "./discovery.ts";
import type { Operation } from "npm:effection@3.6.0";
import {
  mockGenerateImportMap,
  mockRunDenoTests,
  mockRunLint,
  mockRunDNTBuild,
  mockRunNodeTests
} from "./verify-mocks.ts";

describe("Verification", () => {
  let mockDeps: any;

  beforeEach(function* () {
    yield* setupLogging(false);
    
    // Set up mock dependencies
    mockDeps = {
      generateImportMap: mockGenerateImportMap,
      runDenoTests: mockRunDenoTests,
      runLint: mockRunLint,
      runDNTBuild: mockRunDNTBuild,
      runNodeTests: mockRunNodeTests
    };
  });

  describe("runVerification", () => {
    it("should verify single extension with single Effection version", function* () {
      // Create extension with tests that should pass
      const extensionPath = yield* createExtension({
        name: "@effectionx/crystal-magic",
        effectionVersions: ["3.6.0"],
        hasTests: true,
        hasLintIssues: false,
        dntShouldSucceed: true,
        nodeTestsShouldPass: true
      });

      const extensions: DiscoveredExtension[] = [{
        name: "@effectionx/crystal-magic",
        path: extensionPath,
        config: {
          name: "@effectionx/crystal-magic",
          description: "Magical crystal manipulation utilities",
          effection: ["3.6.0"],
          registries: ["jsr", "npm"] as const
        },
        version: "1.0.0",
        resolvedVersions: []
      }];

      const result = yield* runVerification(extensions, mockDeps);

      expect(result).toMatchObject([
        {
          extension: {
            name: "@effectionx/crystal-magic"
          },
          overallSuccess: true,
          results: {
            "3.6.0": {
              importMap: { success: true },
              denoTests: { success: true },
              lint: { success: true },
              dntBuild: { success: true },
              nodeTests: { success: true },
              overall: true
            }
          }
        }
      ]);
    });

    it("should verify extension with multiple Effection versions", function* () {
      // Create extension that works with both versions
      const extensionPath = yield* createExtension({
        name: "@effectionx/time-wizard",
        effectionVersions: ["3.5.0", "3.6.0"],
        hasTests: true,
        hasLintIssues: false,
        dntShouldSucceed: true,
        nodeTestsShouldPass: true
      });

      const extensions: DiscoveredExtension[] = [{
        name: "@effectionx/time-wizard",
        path: extensionPath,
        config: {
          name: "@effectionx/time-wizard",
          description: "Temporal manipulation utilities",
          effection: ["3.5.0", "3.6.0"],
          registries: ["jsr"] as const
        },
        version: "2.1.0",
        resolvedVersions: []
      }];

      const result = yield* runVerification(extensions, mockDeps);

      expect(result).toMatchObject([
        {
          extension: {
            name: "@effectionx/time-wizard"
          },
          overallSuccess: true,
          results: {
            "3.5.0": {
              overall: true
            },
            "3.6.0": {
              overall: true
            }
          }
        }
      ]);
    });

    it("should handle extension with failing tests", function* () {
      // Create extension with failing tests
      const extensionPath = yield* createExtension({
        name: "@effectionx/broken-spell",
        effectionVersions: ["3.6.0"],
        hasTests: true,
        hasLintIssues: false,
        dntShouldSucceed: true,
        nodeTestsShouldPass: false // Node tests will fail
      });

      const extensions: DiscoveredExtension[] = [{
        name: "@effectionx/broken-spell",
        path: extensionPath,
        config: {
          name: "@effectionx/broken-spell",
          description: "Spell casting with bugs",
          effection: ["3.6.0"],
          registries: ["npm"] as const
        },
        version: "0.1.0",
        resolvedVersions: []
      }];

      const result = yield* runVerification(extensions, mockDeps);

      expect(result).toMatchObject([
        {
          extension: {
            name: "@effectionx/broken-spell"
          },
          overallSuccess: false,
          results: {
            "3.6.0": {
              importMap: { success: true },
              denoTests: { success: true },
              lint: { success: true },
              dntBuild: { success: true },
              nodeTests: { success: false },
              overall: false
            }
          }
        }
      ]);
    });

    it("should handle extension with lint issues", function* () {
      // Create extension with linting problems
      const extensionPath = yield* createExtension({
        name: "@effectionx/messy-code",
        effectionVersions: ["3.6.0"],
        hasTests: true,
        hasLintIssues: true, // Will have lint issues
        dntShouldSucceed: true,
        nodeTestsShouldPass: true
      });

      const extensions: DiscoveredExtension[] = [{
        name: "@effectionx/messy-code",
        path: extensionPath,
        config: {
          name: "@effectionx/messy-code",
          description: "Code with style issues",
          effection: ["3.6.0"],
          registries: ["jsr"] as const
        },
        version: "1.2.3",
        resolvedVersions: []
      }];

      const result = yield* runVerification(extensions, mockDeps);

      expect(result).toMatchObject([
        {
          extension: {
            name: "@effectionx/messy-code"
          },
          overallSuccess: false,
          results: {
            "3.6.0": {
              lint: { 
                success: false,
                issuesFound: expect.any(Number)
              },
              overall: false
            }
          }
        }
      ]);
      
      // Verify issues were actually found
      const versionResult = result[0].results["3.6.0"];
      expect(versionResult.lint.issuesFound).toBeGreaterThan(0);
    });

    it("should handle DNT build failure and skip remaining versions", function* () {
      // Create extension where DNT build fails (non-network error)
      const extensionPath = yield* createExtension({
        name: "@effectionx/build-breaker",
        effectionVersions: ["3.5.0", "3.6.0"],
        hasTests: true,
        hasLintIssues: false,
        dntShouldSucceed: false, // DNT will fail
        nodeTestsShouldPass: true
      });

      const extensions: DiscoveredExtension[] = [{
        name: "@effectionx/build-breaker",
        path: extensionPath,
        config: {
          name: "@effectionx/build-breaker",
          description: "Extension that breaks builds",
          effection: ["3.5.0", "3.6.0"],
          registries: ["npm"] as const
        },
        version: "0.0.1",
        resolvedVersions: []
      }];

      const result = yield* runVerification(extensions, mockDeps);

      expect(result).toMatchObject([
        {
          extension: {
            name: "@effectionx/build-breaker"
          },
          overallSuccess: false,
          results: {
            "3.5.0": {
              dntBuild: { success: false },
              nodeTests: { skipped: true },
              overall: false
            }
            // 3.6.0 should not exist due to critical failure
          }
        }
      ]);
      
      // Verify second version was skipped entirely
      expect(result[0].results["3.6.0"]).toBeUndefined();
    });

    it("should handle multiple extensions with mixed results", function* () {
      // Create multiple extensions with different outcomes
      const successPath = yield* createExtension({
        name: "@effectionx/success-story", 
        effectionVersions: ["3.6.0"],
        hasTests: true,
        hasLintIssues: false,
        dntShouldSucceed: true,
        nodeTestsShouldPass: true
      });

      const failPath = yield* createExtension({
        name: "@effectionx/failure-tale",
        effectionVersions: ["3.6.0"],
        hasTests: true,
        hasLintIssues: true,
        dntShouldSucceed: false,
        nodeTestsShouldPass: false
      });

      const extensions: DiscoveredExtension[] = [
        {
          name: "@effectionx/success-story",
          path: successPath,
          config: {
            name: "@effectionx/success-story",
            description: "Always works perfectly",
            effection: ["3.6.0"],
            registries: ["jsr"] as const
          },
          version: "1.0.0",
          resolvedVersions: []
        },
        {
          name: "@effectionx/failure-tale",
          path: failPath,
          config: {
            name: "@effectionx/failure-tale", 
            description: "Nothing works here",
            effection: ["3.6.0"],
            registries: ["npm"] as const
          },
          version: "0.0.1",
          resolvedVersions: []
        }
      ];

      const result = yield* runVerification(extensions, mockDeps);

      expect(result).toHaveLength(2);
      expect(result).toMatchObject([
        {
          extension: {
            name: "@effectionx/success-story"
          },
          overallSuccess: true,
          results: {
            "3.6.0": {
              overall: true
            }
          }
        },
        {
          extension: {
            name: "@effectionx/failure-tale"
          },
          overallSuccess: false,
          results: {
            "3.6.0": {
              overall: false
            }
          }
        }
      ]);
    });

    it("should handle extension with no tests gracefully", function* () {
      // Create extension without test files
      const extensionPath = yield* createExtension({
        name: "@effectionx/no-tests",
        effectionVersions: ["3.6.0"],
        hasTests: false, // No test files
        hasLintIssues: false,
        dntShouldSucceed: true,
        nodeTestsShouldPass: true
      });

      const extensions: DiscoveredExtension[] = [{
        name: "@effectionx/no-tests",
        path: extensionPath,
        config: {
          name: "@effectionx/no-tests",
          description: "Extension without tests",
          effection: ["3.6.0"],
          registries: ["jsr"] as const
        },
        version: "1.0.0",
        resolvedVersions: []
      }];

      const result = yield* runVerification(extensions, mockDeps);

      expect(result).toMatchObject([
        {
          extension: {
            name: "@effectionx/no-tests"
          },
          overallSuccess: true,
          results: {
            "3.6.0": {
              denoTests: { success: true },
              nodeTests: { 
                success: true,
                testsRun: 0
              },
              overall: true
            }
          }
        }
      ]);
    });

    it("should verify each version in separate temp directories", function* () {
      // This test ensures isolation between version tests
      const extensionPath = yield* createExtension({
        name: "@effectionx/isolation-test",
        effectionVersions: ["3.5.0", "3.6.0"],
        hasTests: true,
        hasLintIssues: false,
        dntShouldSucceed: true,
        nodeTestsShouldPass: true
      });

      const extensions: DiscoveredExtension[] = [{
        name: "@effectionx/isolation-test",
        path: extensionPath,
        config: {
          name: "@effectionx/isolation-test",
          description: "Tests isolation between versions",
          effection: ["3.5.0", "3.6.0"],
          registries: ["jsr"] as const
        },
        version: "1.0.0",
        resolvedVersions: []
      }];

      const result = yield* runVerification(extensions, mockDeps);

      expect(result).toMatchObject([
        {
          extension: {
            name: "@effectionx/isolation-test"
          },
          overallSuccess: true,
          results: {
            "3.5.0": {
              importMap: { success: true },
              overall: true
            },
            "3.6.0": {
              importMap: { success: true },
              overall: true
            }
          }
        }
      ]);
    });
  });
});

// Helper function to create test extensions
function* createExtension(
  options: {
    name: string;
    effectionVersions: string[];
    hasTests: boolean;
    hasLintIssues: boolean;
    dntShouldSucceed: boolean;
    nodeTestsShouldPass: boolean;
  }
): Operation<string> {
  const extensionTempDir = yield* createTempDir({ 
    prefix: `verify-ext-${options.name.replace("@effectionx/", "")}-` 
  });
  
  const files: Record<string, string> = {
    "deno.json": JSON.stringify({
      name: options.name,
      version: "1.0.0",
      exports: "./mod.ts"
    }),
    
    "mod.ts": options.hasLintIssues 
      ? `// This file has lint issues
var badVariable = "should use const"; // no-var rule violation  
export function ${options.name.replace("@effectionx/", "").replace("-", "")}Function() {
  console.log(badVariable)
  return "magic";
}`
      : `export function ${options.name.replace("@effectionx/", "").replace("-", "")}Function() {
  return "magic";
}`,

    "ex-publisher.ts": `
export default {
  name: "${options.name}",
  description: "Test extension for verification",
  effection: ${JSON.stringify(options.effectionVersions)},
  registries: ["jsr", "npm"]
};
`
  };

  if (options.hasTests) {
    files["mod.test.ts"] = `
import { expect } from "expect";
import { ${options.name.replace("@effectionx/", "").replace("-", "")}Function } from "./mod.ts";

Deno.test("${options.name} basic functionality", () => {
  const result = ${options.name.replace("@effectionx/", "").replace("-", "")}Function();
  expect(result).toBe("magic");
});

${!options.nodeTestsShouldPass ? `
Deno.test("${options.name} failing test", () => {
  // This test will fail in Node.js environment
  expect(true).toBe(false);
});
` : ''}
`;
  }

  yield* extensionTempDir.withFiles(files);
  return extensionTempDir.path;
}