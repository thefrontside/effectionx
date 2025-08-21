import { call, Operation, until } from "npm:effection@3.6.0";
import { command } from "npm:zod-opts@0.1.8";
import { z } from "npm:zod@^3.20.2";
import { join } from "jsr:@std/path";
import type { VerifyFlags } from "../types.ts";
import { log, namespace } from "../logger.ts";
import type { DiscoveredExtension } from "../lib/discovery.ts";
import type { DenoTestResult } from "../lib/deno-test.ts";
import type { LintResult } from "../lib/lint.ts";
import type { DNTBuildResult } from "../lib/dnt.ts";
import type { NodeTestResult } from "../lib/node-test.ts";
import { generateImportMap } from "../lib/import-map.ts";
import { runDenoTests } from "../lib/deno-test.ts";
import { runLint } from "../lib/lint.ts";
import { runDNTBuild } from "../lib/dnt.ts";
import { runNodeTests } from "../lib/node-test.ts";
import type { ImportMap } from "../lib/import-map.ts";
import { createTempDir } from "../testing/temp-dir.ts";

export interface ImportMapResult {
  success: boolean;
  error?: string;
  importMapPath?: string;
}

export interface VersionVerificationResult {
  importMap: ImportMapResult;
  denoTests: DenoTestResult;
  lint: LintResult;
  dntBuild: DNTBuildResult;
  nodeTests: NodeTestResult & { skipped?: boolean };
  overall: boolean;
}

export interface ExtensionVerificationResult {
  extension: DiscoveredExtension;
  results: Record<string, VersionVerificationResult>;
  overallSuccess: boolean;
}

export interface VerificationDependencies {
  generateImportMap: (effectionVersion: string, baseImportMap?: ImportMap) => Operation<ImportMap>;
  runDenoTests: (options: { workingDir: string; importMapPath?: string; cacheDir?: string }) => Operation<DenoTestResult>;
  runLint: (options: { packageDir: string; cacheDir?: string }) => Operation<LintResult>;
  runDNTBuild: (options: { config: any; workingDir: string; importMapPath?: string; cacheDir?: string }) => Operation<DNTBuildResult>;
  runNodeTests: (options: { packageDir: string }) => Operation<NodeTestResult>;
}

export function* verify(flags: VerifyFlags, extensions?: DiscoveredExtension[]): Operation<ExtensionVerificationResult[]> {
  return yield* call(function* () {
    yield* namespace("verify");
    return yield* verifyCommand(flags, extensions);
  });
}

export function* verifyCommand(flags: VerifyFlags, extensions?: DiscoveredExtension[]): Operation<ExtensionVerificationResult[]> {
  if (flags.verbose) {
    yield* log.debug("Running verify command with flags:", flags);
  }

  if (!extensions || extensions.length === 0) {
    yield* log.warn("No extensions provided for verification");
    return [];
  }

  // Filter extensions if specific extension requested
  let extensionsToVerify = extensions;
  if (flags.extName) {
    extensionsToVerify = extensions.filter(ext => ext.name === flags.extName);
    if (extensionsToVerify.length === 0) {
      yield* log.error(`Extension "${flags.extName}" not found`);
      return [];
    }
  }

  // Run verification
  const results = yield* runVerification(extensionsToVerify);
  
  // Report results
  const successCount = results.filter(r => r.overallSuccess).length;
  const totalCount = results.length;
  
  if (successCount === totalCount) {
    yield* log.info(`✅ All ${totalCount} extensions passed verification`);
  } else {
    yield* log.warn(`❌ ${totalCount - successCount}/${totalCount} extensions failed verification`);
    
    // List failed extensions
    const failures = results.filter(r => !r.overallSuccess);
    for (const failure of failures) {
      yield* log.warn(`  - ${failure.extension.name}: ${Object.keys(failure.results).length} version(s) tested`);
    }
  }
  
  return results;
}

/**
 * Run verification for all discovered extensions.
 * Tests each extension against all its supported Effection versions.
 */
export function* runVerification(
  extensions: DiscoveredExtension[],
  deps?: VerificationDependencies
): Operation<ExtensionVerificationResult[]> {
  // Use real implementations by default, allow mocks for testing
  const dependencies: VerificationDependencies = deps ?? {
    generateImportMap,
    runDenoTests,
    runLint,
    runDNTBuild,
    runNodeTests
  };
  yield* log.info(`Starting verification of ${extensions.length} extensions`);
  
  // Create timestamped verification run directory  
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const verificationRunDir = join(Deno.cwd(), `ex-publisher-verify-${timestamp}`);
  yield* log.debug(`Creating verification run directory: ${verificationRunDir}`);
  
  // Create shared cache directory for all verification operations
  const sharedCacheDir = join(Deno.cwd(), "ex-publisher-cache");
  yield* log.debug(`Using shared cache directory: ${sharedCacheDir}`);
  
  const results: ExtensionVerificationResult[] = [];
  
  for (const extension of extensions) {
    yield* log.info(`Verifying ${extension.name}...`);
    
    const extensionResult = yield* verifyExtension(extension, dependencies, verificationRunDir, sharedCacheDir);
    results.push(extensionResult);
    
    if (extensionResult.overallSuccess) {
      yield* log.info(`✅ ${extension.name} verification passed`);
    } else {
      yield* log.warn(`❌ ${extension.name} verification failed`);
    }
  }
  
  const successCount = results.filter(r => r.overallSuccess).length;
  yield* log.info(`Verification complete: ${successCount}/${extensions.length} extensions passed`);
  yield* log.info(`Verification artifacts saved to: ${verificationRunDir}`);
  
  return results;
}

/**
 * Verify a single extension against all its supported Effection versions.
 */
function* verifyExtension(
  extension: DiscoveredExtension,
  deps: VerificationDependencies,
  verificationRunDir: string,
  sharedCacheDir: string
): Operation<ExtensionVerificationResult> {
  const results: Record<string, VersionVerificationResult> = {};
  let overallSuccess = true;
  let shouldContinue = true;
  
  yield* log.debug(`Verifying ${extension.name} against ${extension.config.effection.length} Effection versions`);
  
  for (const effectionVersion of extension.config.effection) {
    if (!shouldContinue) {
      yield* log.debug(`Skipping remaining versions for ${extension.name} due to critical failure`);
      break;
    }
    
    yield* log.debug(`Testing ${extension.name} with Effection ${effectionVersion}`);
    
    try {
      const versionResult = yield* verifyExtensionVersion(extension, effectionVersion, deps, verificationRunDir, sharedCacheDir);
      results[effectionVersion] = versionResult;
      
      if (!versionResult.overall) {
        overallSuccess = false;
        
        // Check if this was a DNT build failure (non-network error)
        if (!versionResult.dntBuild.success && !isNetworkError(versionResult.dntBuild.stderr)) {
          yield* log.warn(`DNT build failed for ${extension.name}@${effectionVersion}, skipping remaining versions`);
          shouldContinue = false;
        }
      }
    } catch (error) {
      yield* log.error(`Critical error verifying ${extension.name}@${effectionVersion}:`, error);
      overallSuccess = false;
      shouldContinue = false;
    }
  }
  
  return {
    extension,
    results,
    overallSuccess
  };
}

/**
 * Verify a single extension against a specific Effection version.
 */
function* verifyExtensionVersion(
  extension: DiscoveredExtension,
  effectionVersion: string,
  deps: VerificationDependencies,
  verificationRunDir: string,
  sharedCacheDir: string
): Operation<VersionVerificationResult> {
  // Create isolated temp directory for this version test in the verification run directory
  const tempDir = yield* createTempDir({ 
    prefix: `verify-${extension.name.replace("@effectionx/", "")}-${effectionVersion}-`,
    baseDir: verificationRunDir
  });
  
  // Create shared cache directory if it doesn't exist
  yield* until(Deno.mkdir(sharedCacheDir, { recursive: true }));
  
  try {
    yield* log.debug(`Using temp directory: ${tempDir.path}`);
    
    // Step 1: Generate import map
    yield* log.debug(`Generating import map for Effection ${effectionVersion}`);
    const importMapResult = yield* generateImportMapForVersion(extension, effectionVersion, tempDir.path, deps);
    
    // Step 2: Run Deno tests
    yield* log.debug(`Running Deno tests`);
    const denoTestResult = yield* deps.runDenoTests({
      workingDir: extension.path,
      importMapPath: importMapResult.importMapPath,
      cacheDir: sharedCacheDir
    });
    
    // Step 3: Run lint
    yield* log.debug(`Running lint`);
    const lintResult = yield* deps.runLint({
      packageDir: extension.path,
      cacheDir: sharedCacheDir
    });
    
    // Step 4: Build Node.js package with DNT
    yield* log.debug(`Building Node.js package`);
    const dntBuildResult = yield* runDNTBuildForVersion(extension, effectionVersion, tempDir.path, deps, sharedCacheDir);
    
    // Step 5: Run Node.js tests (if build succeeded)
    let nodeTestResult: NodeTestResult & { skipped?: boolean };
    
    if (dntBuildResult.success) {
      yield* log.debug(`Running Node.js tests`);
      nodeTestResult = yield* deps.runNodeTests({
        packageDir: join(tempDir.path, "npm")
      });
    } else {
      yield* log.debug(`Skipping Node.js tests due to build failure`);
      nodeTestResult = {
        success: false,
        skipped: true,
        testsRun: 0,
        testsPassed: 0,
        testsFailed: 0,
        testFailures: [],
        stdout: "Skipped due to DNT build failure",
        stderr: "",
        exitCode: 1
      };
    }
    
    // Determine overall success for this version
    const overall = importMapResult.success && 
                   denoTestResult.success && 
                   lintResult.success && 
                   dntBuildResult.success && 
                   nodeTestResult.success;
    
    return {
      importMap: importMapResult,
      denoTests: denoTestResult,
      lint: lintResult,
      dntBuild: dntBuildResult,
      nodeTests: nodeTestResult,
      overall
    };
  } finally {
    // Temp directory cleanup handled by createTempDir
  }
}

/**
 * Run DNT build for a specific Effection version.
 */
function* runDNTBuildForVersion(
  extension: DiscoveredExtension,
  effectionVersion: string,
  tempDir: string,
  deps: VerificationDependencies,
  sharedCacheDir: string
): Operation<DNTBuildResult> {
  try {
    // For the real implementation, we would generate a proper DNT config
    // For now, create a minimal config for the mock
    const dntConfig = {
      entryPoints: ["./mod.ts"],
      outDir: join(tempDir, "npm"),
      shims: { deno: true },
      mappings: { "effection": `npm:effection@${effectionVersion}` },
      package: {
        name: extension.config.name,
        version: extension.version,
        description: extension.config.description,
        license: "MIT",
        dependencies: {}
      }
    };
    
    return yield* deps.runDNTBuild({
      config: dntConfig,
      workingDir: extension.path,
      importMapPath: undefined,
      cacheDir: sharedCacheDir
    });
  } catch (error) {
    yield* log.error(`Failed to build Node.js package for ${extension.name}@${effectionVersion}:`, error);
    return {
      success: false,
      exitCode: 1,
      stdout: "",
      stderr: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Generate import map for a specific Effection version.
 */
function* generateImportMapForVersion(
  extension: DiscoveredExtension,
  effectionVersion: string,
  tempDir: string,
  deps: VerificationDependencies
): Operation<ImportMapResult> {
  try {
    const importMapPath = join(tempDir, "import_map.json");
    
    // Generate the import map
    const importMap = yield* deps.generateImportMap(effectionVersion);
    
    // Save to file
    yield* until(Deno.writeTextFile(importMapPath, JSON.stringify(importMap, null, 2)));
    
    return {
      success: true,
      importMapPath
    };
  } catch (error) {
    yield* log.error(`Failed to generate import map for Effection ${effectionVersion}:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

/**
 * Check if an error is network-related and should be retried.
 */
function isNetworkError(error?: string): boolean {
  if (!error) return false;
  
  const networkIndicators = [
    "network",
    "timeout", 
    "ECONNREFUSED",
    "ENOTFOUND",
    "ETIMEDOUT",
    "fetch failed",
    "connection refused"
  ];
  
  const lowerError = error.toLowerCase();
  return networkIndicators.some(indicator => lowerError.includes(indicator));
}

export const verifyCommandDefinition = command("verify")
  .description("Run tests for extensions")
  .options({
    verbose: {
      type: z.boolean().default(false),
      alias: "v",
      description: "Print debugging output",
    },
    extName: {
      type: z.string().optional(),
      description: "Select extension to run tests for",
    },
    deno: {
      type: z.boolean().optional(),
      description: "Run tests for deno",
    },
    node: {
      type: z.boolean().optional(),
      description: "Run tests for node",
    },
    effection: {
      type: z.string().optional(),
      description: "Run tests for specified version of Effection",
    },
    lint: {
      type: z.boolean().optional(),
      description: "Run lint as part of verify",
    },
  });