import type { Operation } from "npm:effection@3.6.0";
import type { DenoTestResult } from "./deno-test.ts";
import type { LintResult } from "./lint.ts";
import type { DNTBuildResult } from "./dnt.ts";
import type { NodeTestResult } from "./node-test.ts";
import type { ImportMap } from "./import-map.ts";

interface MockOptions {
  shouldSucceed: boolean;
  hasTests?: boolean;
  hasLintIssues?: boolean;
  dntShouldSucceed?: boolean;
  nodeTestsShouldPass?: boolean;
}

export function* mockGenerateImportMap(
  effectionVersion: string,
  baseImportMap?: ImportMap,
): Operation<ImportMap> {
  // Always succeeds for mocks
  return {
    imports: {
      ...baseImportMap?.imports,
      "effection": `npm:effection@${effectionVersion}`,
    }
  };
}

export function* mockRunDenoTests(options: {
  workingDir: string;
  importMapPath?: string;
  cacheDir?: string;
}): Operation<DenoTestResult> {
  // Extract mock behavior from the working directory path
  const mockOpts = getMockOptionsFromPath(options.workingDir);
  
  // Deno tests always succeed except for extensions with explicit deno test failures
  const denoTestsShouldPass = !options.workingDir.includes("deno-fail");
  
  return {
    success: denoTestsShouldPass,
    exitCode: denoTestsShouldPass ? 0 : 1,
    stdout: denoTestsShouldPass ? "Test passed" : "Test failed",
    stderr: ""
  };
}

export function* mockRunLint(options: {
  packageDir: string;
  cacheDir?: string;
}): Operation<LintResult> {
  const mockOpts = getMockOptionsFromPath(options.packageDir);
  const hasLintIssues = mockOpts.hasLintIssues ?? false;
  
  return {
    success: !hasLintIssues,
    exitCode: hasLintIssues ? 1 : 0,
    stdout: "",
    stderr: hasLintIssues ? "error[no-var]: `var` keyword is not allowed." : "Checked 1 file",
    issuesFound: hasLintIssues ? 1 : 0,
    errors: hasLintIssues ? 1 : 0,
    warnings: 0,
    issues: hasLintIssues ? [{
      file: "mod.ts",
      line: 2,
      column: 1,
      severity: "error" as const,
      message: "`var` keyword is not allowed.",
      rule: "no-var"
    }] : []
  };
}

export function* mockRunDNTBuild(options: {
  config: any;
  workingDir: string;
  importMapPath?: string;
  cacheDir?: string;
}): Operation<DNTBuildResult> {
  const mockOpts = getMockOptionsFromPath(options.workingDir);
  const dntShouldSucceed = mockOpts.dntShouldSucceed ?? true;
  
  return {
    success: dntShouldSucceed,
    exitCode: dntShouldSucceed ? 0 : 1,
    stdout: dntShouldSucceed ? "Build successful" : "",
    stderr: dntShouldSucceed ? "" : "Build failed: compilation error"
  };
}

export function* mockRunNodeTests(options: {
  packageDir: string;
}): Operation<NodeTestResult> {
  const mockOpts = getMockOptionsFromPath(options.packageDir);
  const nodeTestsShouldPass = mockOpts.nodeTestsShouldPass ?? true;
  const hasTests = mockOpts.hasTests ?? true;
  
  return {
    success: nodeTestsShouldPass,
    exitCode: nodeTestsShouldPass ? 0 : 1,
    stdout: hasTests ? "Test execution output" : "No tests found",
    stderr: "",
    testsRun: hasTests ? 1 : 0,
    testsPassed: (hasTests && nodeTestsShouldPass) ? 1 : 0,
    testsFailed: (hasTests && !nodeTestsShouldPass) ? 1 : 0,
    testFailures: (hasTests && !nodeTestsShouldPass) ? [{
      name: "failing test",
      error: "Test assertion failed"
    }] : []
  };
}

function getMockOptionsFromPath(path: string): MockOptions {
  // Extract behavior from the path/extension name
  if (path.includes("crystal-magic")) {
    return { shouldSucceed: true, hasTests: true, hasLintIssues: false, dntShouldSucceed: true, nodeTestsShouldPass: true };
  } else if (path.includes("time-wizard")) {
    return { shouldSucceed: true, hasTests: true, hasLintIssues: false, dntShouldSucceed: true, nodeTestsShouldPass: true };
  } else if (path.includes("broken-spell")) {
    return { shouldSucceed: false, hasTests: true, hasLintIssues: false, dntShouldSucceed: true, nodeTestsShouldPass: false };
  } else if (path.includes("messy-code")) {
    return { shouldSucceed: false, hasTests: true, hasLintIssues: true, dntShouldSucceed: true, nodeTestsShouldPass: true };
  } else if (path.includes("build-breaker")) {
    return { shouldSucceed: false, hasTests: true, hasLintIssues: false, dntShouldSucceed: false, nodeTestsShouldPass: true };
  } else if (path.includes("success-story")) {
    return { shouldSucceed: true, hasTests: true, hasLintIssues: false, dntShouldSucceed: true, nodeTestsShouldPass: true };
  } else if (path.includes("failure-tale")) {
    return { shouldSucceed: false, hasTests: true, hasLintIssues: true, dntShouldSucceed: false, nodeTestsShouldPass: false };
  } else if (path.includes("no-tests")) {
    return { shouldSucceed: true, hasTests: false, hasLintIssues: false, dntShouldSucceed: true, nodeTestsShouldPass: true };
  } else if (path.includes("isolation-test")) {
    return { shouldSucceed: true, hasTests: true, hasLintIssues: false, dntShouldSucceed: true, nodeTestsShouldPass: true };
  }
  
  // Default to success
  return { shouldSucceed: true, hasTests: true, hasLintIssues: false, dntShouldSucceed: true, nodeTestsShouldPass: true };
}