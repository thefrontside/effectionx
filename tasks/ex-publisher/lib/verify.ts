import { Operation, until } from "npm:effection@3.6.0";
import { join } from "jsr:@std/path";
import type { DiscoveredExtension } from "./discovery.ts";
import type { DenoTestResult } from "./deno-test.ts";
import type { LintResult } from "./lint.ts";
import type { DNTBuildResult } from "./dnt.ts";
import type { NodeTestResult } from "./node-test.ts";
import { generateImportMap } from "./import-map.ts";
import { runDenoTests } from "./deno-test.ts";
import { runLint } from "./lint.ts";
import { runDNTBuild } from "./dnt.ts";
import { runNodeTests } from "./node-test.ts";
import type { ImportMap } from "./import-map.ts";
import { createTempDir } from "../testing/temp-dir.ts";
import { log } from "../logger.ts";

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
  runDenoTests: (options: { workingDir: string; importMapPath?: string }) => Operation<DenoTestResult>;
  runLint: (options: { packageDir: string }) => Operation<LintResult>;
  runDNTBuild: (options: { config: any; workingDir: string; importMapPath?: string }) => Operation<DNTBuildResult>;
  runNodeTests: (options: { packageDir: string }) => Operation<NodeTestResult>;
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
  
  const results: ExtensionVerificationResult[] = [];
  
  for (const extension of extensions) {
    yield* log.info(`Verifying ${extension.name}...`);
    
    const extensionResult = yield* verifyExtension(extension, dependencies);
    results.push(extensionResult);
    
    if (extensionResult.overallSuccess) {
      yield* log.info(`✅ ${extension.name} verification passed`);
    } else {
      yield* log.warn(`❌ ${extension.name} verification failed`);
    }
  }
  
  const successCount = results.filter(r => r.overallSuccess).length;
  yield* log.info(`Verification complete: ${successCount}/${extensions.length} extensions passed`);
  
  return results;
}

/**
 * Verify a single extension against all its supported Effection versions.
 */
function* verifyExtension(
  extension: DiscoveredExtension,
  deps: VerificationDependencies
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
      const versionResult = yield* verifyExtensionVersion(extension, effectionVersion, deps);
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
  deps: VerificationDependencies
): Operation<VersionVerificationResult> {
  // Create isolated temp directory for this version test
  const tempDir = yield* createTempDir({ 
    prefix: `verify-${extension.name.replace("@effectionx/", "")}-${effectionVersion}-` 
  });
  
  try {
    yield* log.debug(`Using temp directory: ${tempDir.path}`);
    
    // Step 1: Generate import map
    yield* log.debug(`Generating import map for Effection ${effectionVersion}`);
    const importMapResult = yield* generateImportMapForVersion(extension, effectionVersion, tempDir.path, deps);
    
    // Step 2: Run Deno tests
    yield* log.debug(`Running Deno tests`);
    const denoTestResult = yield* deps.runDenoTests({
      workingDir: extension.path,
      importMapPath: importMapResult.importMapPath
    });
    
    // Step 3: Run lint
    yield* log.debug(`Running lint`);
    const lintResult = yield* deps.runLint({
      packageDir: extension.path
    });
    
    // Step 4: Build Node.js package with DNT
    yield* log.debug(`Building Node.js package`);
    const dntBuildResult = yield* runDNTBuildForVersion(extension, effectionVersion, tempDir.path, deps);
    
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
  deps: VerificationDependencies
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
      importMapPath: undefined
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