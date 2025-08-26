import { each, Operation, stream, until } from "npm:effection@3.6.0";
import { log } from "../logger.ts";

export interface DenoTestOptions {
  workingDir: string;
  testFiles?: string[];
  importMapPath?: string;
  additionalFlags?: string[];
  cacheDir?: string;
}

export interface DenoTestResult {
  success: boolean;
  exitCode: number;
  stdout: string;
  stderr: string;
}

export interface FindTestFilesOptions {
  patterns?: string[];
  excludePatterns?: string[];
}

export function* runDenoTests(options: DenoTestOptions): Operation<DenoTestResult> {
  const { workingDir, testFiles = [], importMapPath, additionalFlags = [] } = options;

  yield* log.debug(`Running Deno tests in ${workingDir}`);

  const args = ["test"];

  // Note: deno test doesn't support --cache-dir flag, so we don't use cacheDir here

  // Add import map if provided
  if (importMapPath) {
    args.push("--import-map", importMapPath);
  }

  // Add additional flags
  args.push(...additionalFlags);

  // Add test files or use default discovery
  if (testFiles.length > 0) {
    args.push(...testFiles);
  }

  yield* log.debug(`Executing: deno ${args.join(" ")}`);

  const command = new Deno.Command("deno", {
    args,
    cwd: workingDir,
    stdout: "piped",
    stderr: "piped",
  });

  const process = yield* until(command.output());

  const stdout = new TextDecoder().decode(process.stdout);
  const stderr = new TextDecoder().decode(process.stderr);

  const result: DenoTestResult = {
    success: process.success,
    exitCode: process.code,
    stdout,
    stderr,
  };

  if (result.success) {
    yield* log.debug("Deno tests passed");
  } else {
    yield* log.debug(`Deno tests failed with exit code ${result.exitCode}`);
  }

  return result;
}

export function* findTestFiles(
  directory: string,
  options: FindTestFilesOptions = {}
): Operation<string[]> {
  const { patterns = ["**/*.test.ts", "**/*_test.ts", "**/*.spec.ts"], excludePatterns = [] } = options;

  yield* log.debug(`Finding test files in ${directory}`);

  const testFiles: string[] = [];

  // Read .gitignore if it exists
  let gitignorePatterns: string[] = [];
  try {
    const gitignoreContent = yield* until(Deno.readTextFile(`${directory}/.gitignore`));
    gitignorePatterns = gitignoreContent
      .split("\n")
      .map(line => line.trim())
      .filter(line => line && !line.startsWith("#"));
  } catch {
    // .gitignore doesn't exist, continue
  }

  // Walk directory recursively
  yield* walkDirectory(directory, directory, testFiles, patterns, [...excludePatterns, ...gitignorePatterns]);

  yield* log.debug(`Found ${testFiles.length} test files`);
  return testFiles;
}

function* walkDirectory(
  baseDir: string,
  currentDir: string,
  testFiles: string[],
  patterns: string[],
  excludePatterns: string[]
): Operation<void> {

  for (const entry of yield* each(stream(Deno.readDir(currentDir)))) {
    const fullPath = `${currentDir}/${entry.name}`;
    const relativePath = fullPath.replace(`${baseDir}/`, "");

    // Check if path should be excluded
    if (shouldExclude(relativePath, excludePatterns)) {
      yield* each.next();
      continue;
    }

    if (entry.isDirectory) {
      yield* walkDirectory(baseDir, fullPath, testFiles, patterns, excludePatterns);
    } else if (entry.isFile) {
      // Check if file matches test patterns
      if (matchesPatterns(entry.name, patterns)) {
        testFiles.push(relativePath);
      }
    }

    yield* each.next();
  }
}

function shouldExclude(path: string, excludePatterns: string[]): boolean {
  return excludePatterns.some(pattern => {
    // Simple pattern matching - could be enhanced with proper glob matching
    if (pattern.endsWith("/")) {
      return path.startsWith(pattern) || path.includes(`/${pattern}`);
    }
    return path === pattern || path.endsWith(`/${pattern}`) || matchesSimpleGlob(path, pattern);
  });
}

function matchesPatterns(filename: string, patterns: string[]): boolean {
  return patterns.some(pattern => matchesSimpleGlob(filename, pattern));
}

function matchesSimpleGlob(filename: string, pattern: string): boolean {
  // Simple glob matching for basic patterns
  if (pattern.includes("**")) {
    // Handle ** patterns by removing directory part
    const filePattern = pattern.split("/").pop() || pattern;
    return matchesSimpleGlob(filename, filePattern);
  }
  
  if (pattern.includes("*")) {
    // Escape special regex characters except *
    const escapedPattern = pattern.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
    // Replace * with [^/]* to match any character except path separator
    const regex = new RegExp("^" + escapedPattern.replace(/\*/g, "[^/]*") + "$");
    return regex.test(filename);
  }
  
  return filename === pattern;
}