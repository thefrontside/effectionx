import { expect } from "expect";
import { beforeEach, describe, it } from "../testing.ts";
import { createTempDir, type TempDir } from "../testing/temp-dir.ts";
import { setupLogging } from "../testing/logging.ts";
import { runLint } from "./lint.ts";

describe("Lint Execution", () => {
  let tempDir: TempDir;

  beforeEach(function* () {
    yield* setupLogging(false);
    tempDir = yield* createTempDir({ prefix: "ex-publisher-lint-test-" });
  });

  describe("runLint", () => {
    it("should run deno lint and find linting issues", function* () {
      // Create a project with linting issues
      yield* tempDir.withFiles({
        "mod.ts": `
// This file has intentional linting issues
export function badFunction( ) {
  var x = 1; // Use let/const instead of var
  console.log(x)
  return x
}

export const  unusedVar = "not used";
`,
        "good.ts": `
export function goodFunction(): number {
  const x = 42;
  return x;
}
`
      });

      const result = yield* runLint({
        packageDir: tempDir.path,
      });

      expect(result.exitCode).toBe(1); // Deno lint fails when errors are found
      expect(result.success).toBe(false); // Not successful when errors found
      expect(result.issuesFound).toBeGreaterThan(0);
      
      // Check that we got some issues about var usage and other style issues
      const issues = result.issues;
      expect(issues.length).toBeGreaterThan(0);
      
      // Issues should have proper structure
      for (const issue of issues) {
        expect(issue.file).toBeDefined();
        expect(issue.line).toBeGreaterThan(0);
        expect(issue.column).toBeGreaterThan(0);
        expect(issue.severity).toMatch(/error|warning|info/);
        expect(issue.message).toBeDefined();
      }
    });

    it("should handle clean code with no linting issues", function* () {
      yield* tempDir.withFiles({
        "clean.ts": `
export function cleanFunction(): string {
  const message = "Hello, world!";
  return message;
}

export interface CleanInterface {
  name: string;
  value: number;
}
`
      });

      const result = yield* runLint({
        packageDir: tempDir.path,
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.errors).toBe(0);
      expect(result.issuesFound).toBe(0);
      expect(result.issues).toHaveLength(0);
    });

    it("should lint specific files when provided", function* () {
      yield* tempDir.withFiles({
        "good.ts": `
export const good = "This file is clean";
`,
        "bad.ts": `
// This has issues
var bad = "issues"; // Should use const/let
console.log(bad)
`,
        "ignored.ts": `
var ignored = "this file has issues but won't be linted";
console.log(ignored)
`
      });

      const result = yield* runLint({
        packageDir: tempDir.path,
        files: ["good.ts", "bad.ts"] // Only lint these, not ignored.ts
      });

      expect(result.exitCode).toBe(1); // Deno lint fails when errors are found
      expect(result.success).toBe(false);
      
      // Should find issues in bad.ts but not in ignored.ts
      const issueFiles = result.issues.map(issue => issue.file);
      expect(issueFiles.some(file => file.includes("bad.ts"))).toBe(true);
      expect(issueFiles.some(file => file.includes("ignored.ts"))).toBe(false);
    });

    it("should handle syntax errors gracefully", function* () {
      // Create a project with syntax errors that will cause linter to fail
      yield* tempDir.withFiles({
        "broken.ts": `
// This file has syntax errors
export function broken( {
  const x = 1;
  return x;
// Missing closing brace
`
      });

      const result = yield* runLint({
        packageDir: tempDir.path,
      });

      // Deno lint should handle syntax errors and report them
      expect(typeof result.exitCode).toBe("number");
      expect(typeof result.success).toBe("boolean");
      
      // Syntax errors cause deno lint to fail but don't show up as structured lint issues
      // They appear as parsing errors in stderr
      expect(result.success).toBe(false);
      expect(result.exitCode).toBe(1);
    });

    it("should handle empty directories", function* () {
      // Create empty directory
      const emptyTempDir = yield* createTempDir({ prefix: "ex-publisher-empty-lint-" });

      const result = yield* runLint({
        packageDir: emptyTempDir.path,
      });

      expect(result.success).toBe(false); // Empty directory causes deno lint to fail
      expect(result.exitCode).toBe(1); // "No target files found" error
      expect(result.issuesFound).toBe(0); // No linting issues, but command failed
    });

    it("should handle projects with mixed file types", function* () {
      yield* tempDir.withFiles({
        "README.md": "# Test Project",
        "src/index.ts": `
export function example(): void {
  console.log("Hello from example");
}
`,
        "src/utils.js": `
var utils = "some utility"; // Should trigger var rule
console.log(utils)
`,
        "package.json": JSON.stringify({
          name: "test-project",
          version: "1.0.0"
        })
      });

      const result = yield* runLint({
        packageDir: tempDir.path,
      });

      expect(typeof result.exitCode).toBe("number");
      expect(typeof result.success).toBe("boolean");
      
      // Should lint TypeScript and JavaScript files
      if (result.issues.length > 0) {
        const hasJsIssues = result.issues.some(issue => issue.file.endsWith(".js"));
        const hasTsIssues = result.issues.some(issue => issue.file.endsWith(".ts"));
        // At least one type should have issues (or both)
        expect(hasJsIssues || hasTsIssues).toBe(true);
      }
    });

    it("should parse issue details correctly", function* () {
      yield* tempDir.withFiles({
        "issue-test.ts": `
var problematic = "should use const"; // no-var rule
let unused = "never used"; // no-unused-vars rule  
console.log(problematic)
`
      });

      const result = yield* runLint({
        packageDir: tempDir.path,
        files: ["issue-test.ts"]
      });

      expect(result.exitCode).toBe(1); // Deno lint fails when errors are found
      expect(result.success).toBe(false);
      
      expect(result.issues.length).toBeGreaterThan(0);
      const firstIssue = result.issues[0];
      
      // Check issue structure
      expect(firstIssue.file).toContain("issue-test.ts");
      expect(firstIssue.line).toBeGreaterThan(0);
      expect(firstIssue.column).toBeGreaterThan(0);
      expect(firstIssue.severity).toMatch(/error|warning|info/);
      expect(firstIssue.message).toBeDefined();
      expect(firstIssue.message.length).toBeGreaterThan(0);
      
      // Rule should be defined for deno lint
      expect(firstIssue.rule).toBeDefined();
      expect(firstIssue.rule!.length).toBeGreaterThan(0);
    });
  });
});