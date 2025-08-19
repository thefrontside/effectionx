import { Operation, until, each, stream } from "npm:effection@3.6.0";
import { expandGlob } from "jsr:@std/fs@1.0.17/expand-glob";
import { join, resolve } from "jsr:@std/path@1.0.9";
import { log } from "../logger.ts";
import { generateTestRunnerScript } from "./test-runner/code-generator.ts";

export interface NodeTestOptions {
  /** Path to the generated Node.js package directory */
  packageDir: string;
  /** Glob pattern to find test files (defaults to DNT's pattern) */
  testPattern?: string;
  /** Root directory to search for tests (defaults to packageDir) */
  rootTestDir?: string;
  /** Deno test shim package to use */
  denoTestShimPackage?: string;
}

export interface NodeTestFailure {
  /** Name of the failed test */
  name: string;
  /** Error message or object */
  error: string;
  /** Test file path where the failure occurred */
  filePath?: string;
}

export interface NodeTestResult {
  /** Whether all tests passed */
  success: boolean;
  /** Exit code from Node.js process */
  exitCode: number;
  /** Standard output from test execution */
  stdout: string;
  /** Standard error from test execution */
  stderr: string;
  /** Total number of tests that were run */
  testsRun: number;
  /** Number of tests that passed */
  testsPassed: number;
  /** Number of tests that failed */
  testsFailed: number;
  /** Details about failed tests */
  testFailures: NodeTestFailure[];
}

/**
 * Execute Node.js tests in a generated package directory.
 * This function will:
 * 1. Discover test files using the specified pattern
 * 2. Generate a test runner script based on DNT's approach
 * 3. Execute the tests using Node.js
 * 4. Parse and return structured test results
 */
export function* runNodeTests(options: NodeTestOptions): Operation<NodeTestResult> {
  const { packageDir, testPattern, rootTestDir, denoTestShimPackage } = options;
  
  yield* log.debug(`Running Node.js tests in ${packageDir}`);
  
  // Set defaults
  const pattern = testPattern ?? "**/{test.{ts,mts,tsx,js,mjs,jsx},*.test.{ts,mts,tsx,js,mjs,jsx},*_test.{ts,mts,tsx,js,mjs,jsx}}";
  const searchDir = rootTestDir ?? packageDir;
  const shimPackage = denoTestShimPackage; // undefined by default, meaning no Deno test shim
  
  // Discover test files
  const testFiles: string[] = [];
  const globPattern = join(searchDir, pattern);
  
  try {
    const globStream = stream(expandGlob(globPattern, { root: searchDir }));
    
    for (const entry of yield* each(globStream)) {
      if (entry.isFile) {
        // Convert absolute path to relative path from package directory  
        const relativePath = entry.path.replace(packageDir + "/", "");
        testFiles.push(relativePath);
      }
      yield* each.next();
    }
  } catch (error) {
    yield* log.debug(`Error discovering test files: ${error}`);
  }
  
  yield* log.debug(`Found ${testFiles.length} test files:`, testFiles);
  
  // If no tests found, return success with zero counts
  if (testFiles.length === 0) {
    return {
      success: true,
      exitCode: 0,
      stdout: "No tests found",
      stderr: "",
      testsRun: 0,
      testsPassed: 0,
      testsFailed: 0,
      testFailures: [],
    };
  }
  
  // Detect module type from package.json
  let moduleType: "module" | "commonjs" = "commonjs";
  try {
    const packageJsonPath = join(packageDir, "package.json");
    const packageJsonText = yield* until(Deno.readTextFile(packageJsonPath));
    const packageJson = JSON.parse(packageJsonText);
    moduleType = packageJson.type === "module" ? "module" : "commonjs";
  } catch (error) {
    yield* log.debug(`Could not read package.json, defaulting to CommonJS: ${error}`);
  }

  // Generate test runner script
  const testRunnerScript = generateTestRunnerScript({
    testEntryPoints: testFiles,
    denoTestShimPackageName: shimPackage,
    moduleType,
  });
  
  // Write test runner script to package directory
  const testRunnerPath = join(packageDir, "test_runner.js");
  yield* until(Deno.writeTextFile(testRunnerPath, testRunnerScript));
  yield* log.debug(`Generated test runner at ${testRunnerPath}`);

  // Install dependencies if package.json exists
  try {
    const packageJsonPath = join(packageDir, "package.json");
    yield* until(Deno.stat(packageJsonPath));
    yield* log.debug("Installing dependencies with npm install...");
    
    const installCommand = new Deno.Command("npm", {
      args: ["install"],
      cwd: packageDir,
      stdout: "piped",
      stderr: "piped",
    });
    
    const installOutput = yield* until(installCommand.output());
    if (installOutput.code !== 0) {
      const stderr = new TextDecoder().decode(installOutput.stderr);
      yield* log.debug(`npm install failed with exit code ${installOutput.code}: ${stderr}`);
    }
  } catch {
    yield* log.debug("No package.json found or npm install failed, proceeding without dependency installation");
  }
  
  // Execute test runner with Node.js
  const command = new Deno.Command("node", {
    args: ["test_runner.js"],
    cwd: packageDir,
    stdout: "piped",
    stderr: "piped",
  });
  
  const output = yield* until(command.output());
  const stdout = new TextDecoder().decode(output.stdout);
  const stderr = new TextDecoder().decode(output.stderr);
  
  yield* log.debug(`Node.js test execution completed with exit code ${output.code}`);
  yield* log.debug("stdout:", stdout);
  if (stderr) yield* log.debug("stderr:", stderr);
  
  // Parse results from output
  const result = parseTestResults(stdout, stderr, output.code);
  
  // Clean up test runner file
  try {
    yield* until(Deno.remove(testRunnerPath));
  } catch {
    // Ignore cleanup errors
  }
  
  return result;
}

function parseTestResults(stdout: string, stderr: string, exitCode: number): NodeTestResult {
  // Parse test counts and failures from stdout
  let testsRun = 0;
  let testsPassed = 0;
  let testsFailed = 0;
  const testFailures: NodeTestFailure[] = [];
  
  // Look for all result lines like: "test result: ok. 2 passed; 0 failed; 0 ignored; 0 measured; 0 filtered out"
  const resultMatches = [...stdout.matchAll(/test result: (\w+)\. (\d+) passed; (\d+) failed;/g)];
  
  for (const match of resultMatches) {
    const [, status, passedStr, failedStr] = match;
    testsPassed += parseInt(passedStr, 10);
    testsFailed += parseInt(failedStr, 10);
  }
  testsRun = testsPassed + testsFailed;
  
  // Parse individual test failures
  const lines = stdout.split('\n');
  let inFailureSection = false;
  let currentFailure: { name: string; error: string } | null = null;
  
  for (const line of lines) {
    if (line === 'failures:') {
      inFailureSection = true;
      continue;
    }
    
    if (inFailureSection) {
      if (line.trim() === '') {
        if (currentFailure) {
          testFailures.push(currentFailure);
          currentFailure = null;
        }
        continue;
      }
      
      if (!currentFailure) {
        currentFailure = { name: line.trim(), error: '' };
      } else if (line.startsWith('thread \'main\' panicked at ')) {
        currentFailure.error = line.replace('thread \'main\' panicked at ', '');
      }
    }
  }
  
  // Add final failure if exists
  if (currentFailure) {
    testFailures.push(currentFailure);
  }
  
  // Handle stderr errors (syntax errors, etc.)
  if (stderr && exitCode !== 0) {
    if (testsRun === 0) {
      testsFailed = 1;
      testsRun = 1;
    }
    testFailures.push({
      name: "Test execution error",
      error: stderr.trim(),
    });
  }
  
  // Determine success based on test failures rather than exit code
  // since the simple test runner always exits with 0
  const success = testsFailed === 0 && stderr === "";
  
  return {
    success,
    exitCode,
    stdout,
    stderr,
    testsRun,
    testsPassed,
    testsFailed,
    testFailures,
  };
}