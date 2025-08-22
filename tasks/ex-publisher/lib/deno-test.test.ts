import { expect } from "expect";
import { beforeEach, describe, it } from "../testing.ts";
import { createTempDir, type TempDir } from "../testing/temp-dir.ts";
import { setupLogging } from "../testing/logging.ts";
import { runDenoTests, findTestFiles, type DenoTestResult } from "./deno-test.ts";

describe("Deno Test Execution", () => {
  let tempDir: TempDir;

  beforeEach(function* () {
    yield* setupLogging(false);
    tempDir = yield* createTempDir({ prefix: "ex-publisher-deno-test-" });
  });

  describe("runDenoTests", () => {
    beforeEach(function* () {
      // Create a simple test file that passes
      yield* tempDir.withFiles({
        "passing-test.test.ts": `
import { expect } from "expect";
import { describe, it } from "bdd";

describe("Sample Test", () => {
  it("should pass", () => {
    expect(1 + 1).toBe(2);
  });
});`,
        "failing-test.test.ts": `
import { expect } from "expect";
import { describe, it } from "bdd";

describe("Failing Test", () => {
  it("should fail", () => {
    expect(1 + 1).toBe(3);
  });
});`,
        "deno.json": JSON.stringify({
          imports: {
            "bdd": "jsr:@std/testing@1/bdd",
            "expect": "jsr:@std/expect@1"
          }
        })
      });
    });

    it("should execute deno test with custom import map", function* () {
      const importMapPath = `${tempDir.path}/custom-import-map.json`;
      yield* tempDir.withFiles({
        "custom-import-map.json": JSON.stringify({
          imports: {
            "effection": "npm:effection@3.6.0",
            "bdd": "jsr:@std/testing@1/bdd",
            "expect": "jsr:@std/expect@1"
          }
        })
      });

      const result = yield* runDenoTests({
        workingDir: tempDir.path,
        importMapPath,
        testFiles: ["passing-test.test.ts"]
      });

      expect(result.success).toBe(true);
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toContain("ok");
    });

    it("should capture test output and exit code", function* () {
      const result = yield* runDenoTests({
        workingDir: tempDir.path,
        testFiles: ["passing-test.test.ts"]
      });

      expect(result).toMatchObject({
        success: true,
        exitCode: 0,
        stdout: expect.stringContaining("ok"),
        stderr: expect.any(String)
      });
    });

    it("should handle test failures gracefully", function* () {
      const result = yield* runDenoTests({
        workingDir: tempDir.path,
        testFiles: ["failing-test.test.ts"]
      });

      expect(result.success).toBe(false);
      expect(result.exitCode).toBeGreaterThan(0);
      expect(result.stdout).toContain("FAILED");
    });

    it("should pass through additional deno test flags", function* () {
      const result = yield* runDenoTests({
        workingDir: tempDir.path,
        testFiles: ["passing-test.test.ts"],
        additionalFlags: ["--reporter=tap"]
      });

      expect(result.success).toBe(true);
      expect(result.stdout).toContain("TAP version");
    });
  });

  describe("findTestFiles", () => {
    beforeEach(function* () {
      yield* tempDir.withFiles({
        "mod.ts": "export const hello = 'world';",
        "mod.test.ts": "// test file",
        "utils.test.ts": "// another test file", 
        "nested/feature.test.ts": "// nested test",
        "nested/helper.ts": "// not a test",
        "example_test.ts": "// underscore test",
        "integration.spec.ts": "// spec test",
        "README.md": "# Documentation",
        ".gitignore": "dist/\n*.log\nignored.test.ts",
        "ignored.test.ts": "// should be ignored"
      });
    });

    it("should discover test files in extension directory", function* () {
      const testFiles = yield* findTestFiles(tempDir.path);

      expect(testFiles).toEqual(expect.arrayContaining([
        "mod.test.ts",
        "utils.test.ts", 
        "nested/feature.test.ts",
        "example_test.ts",
        "integration.spec.ts"
      ]));
      expect(testFiles).not.toContain("mod.ts");
      expect(testFiles).not.toContain("README.md");
      expect(testFiles).not.toContain("nested/helper.ts");
    });

    it("should filter by test patterns", function* () {
      const testFiles = yield* findTestFiles(tempDir.path, {
        patterns: ["*.test.ts"]
      });

      expect(testFiles).toEqual(expect.arrayContaining([
        "mod.test.ts",
        "utils.test.ts",
        "nested/feature.test.ts"
      ]));
      expect(testFiles).not.toContain("example_test.ts");
      expect(testFiles).not.toContain("integration.spec.ts");
    });

    it("should exclude files in gitignore", function* () {
      const testFiles = yield* findTestFiles(tempDir.path);

      expect(testFiles).not.toContain("ignored.test.ts");
    });
  });
});