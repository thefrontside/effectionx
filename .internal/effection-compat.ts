import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readTextFile } from "@effectionx/fs";
import { exec } from "@effectionx/process";
import { lines } from "@effectionx/stream-helpers";
import { type Operation, each, main, spawn } from "effection";
import semver from "semver";

import { type TapTestResult, parseTapResults } from "./tap-parser.ts";

type PackageInfo = { name: string; dir: string; peerRange: string | null };

type VersionPair = { min: string; max: string };

type VersionGroup = { version: string; packages: string[] };

interface GroupResult {
  version: string;
  packages: string[];
  failures: TapTestResult[];
  passed: number;
  exitCode: number;
}

const rootDir = process.cwd();

const runCommand = (command: string) => exec(command).expect();

const readJson = function* <T>(filePath: string): Operation<T> {
  const raw = yield* readTextFile(filePath);
  return JSON.parse(raw) as T;
};

const getWorkspacePackages = function* (): Operation<PackageInfo[]> {
  const workspace = yield* readTextFile(
    path.join(rootDir, "pnpm-workspace.yaml"),
  );
  const wsLines = workspace
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("-"));
  const entries = wsLines.map((line) =>
    line.replace(/^\s*-\s*/, "").replace(/['"]/g, ""),
  );

  const packages: PackageInfo[] = [];
  for (const entry of entries) {
    // Skip comments
    if (entry.startsWith("#")) continue;

    const dir = path.join(rootDir, entry);
    const pkgPath = path.join(dir, "package.json");
    const pkg = yield* readJson<{
      name: string;
      peerDependencies?: Record<string, string>;
    }>(pkgPath);
    packages.push({
      name: pkg.name,
      dir,
      peerRange: pkg.peerDependencies?.effection ?? null,
    });
  }
  return packages;
};

const fetchEffectionVersions = function* (): Operation<string[]> {
  console.log("Fetching effection versions from npm...");
  const { stdout } = yield* runCommand("npm view effection versions --json");
  return JSON.parse(stdout) as string[];
};

const resolveVersionPair = (
  allVersions: string[],
  range: string,
): VersionPair => {
  const min = semver.minVersion(range)?.version;
  if (!min) throw new Error(`No min version for range: ${range}`);

  const stableMax = semver.maxSatisfying(allVersions, range, {
    includePrerelease: false,
  });
  const max =
    stableMax ??
    semver.maxSatisfying(allVersions, range, { includePrerelease: true });
  if (!max) throw new Error(`No max version for range: ${range}`);

  return { min, max };
};

const resolveVersionGroups = function* (): Operation<VersionGroup[]> {
  const packages = yield* getWorkspacePackages();
  const allVersions = yield* fetchEffectionVersions();
  const groups = new Map<string, Set<string>>();

  for (const pkg of packages) {
    if (!pkg.peerRange) continue;
    const { min, max } = resolveVersionPair(allVersions, pkg.peerRange);

    const minGroup = groups.get(min) ?? new Set<string>();
    const maxGroup = groups.get(max) ?? new Set<string>();

    minGroup.add(pkg.name);
    maxGroup.add(pkg.name);

    groups.set(min, minGroup);
    groups.set(max, maxGroup);

    console.log(`  ${pkg.name}: min=${min}, max=${max}`);
  }

  // Sort by version and convert to array
  const sortedVersions = Array.from(groups.keys()).sort(semver.compare);
  return sortedVersions.map((version) => {
    const pkgSet = groups.get(version);
    return {
      version,
      packages: pkgSet ? Array.from(pkgSet) : [],
    };
  });
};

function* runTestsWithTap(
  filters: string,
  version: string,
  packages: string[],
): Operation<GroupResult> {
  const failures: TapTestResult[] = [];
  let passed = 0;

  // Build command with TAP reporter and grouped output
  const baseNodeOptions = process.env.NODE_OPTIONS ?? "";
  const tapNodeOptions = `${baseNodeOptions} --test-reporter=tap`.trim();
  const command = `pnpm turbo run test ${filters} --log-order=grouped`;

  const proc = yield* exec(command, {
    env: {
      ...process.env,
      NODE_OPTIONS: tapNodeOptions,
    },
    shell: true,
  });

  // Process stdout in real-time
  yield* spawn(function* () {
    const lineStream = lines()(proc.stdout);
    const tapStream = parseTapResults()(lineStream);

    for (const result of yield* each(tapStream)) {
      // Only count actual tests, not suites
      if (result.metadata?.type === "test") {
        if (result.status === "not ok") {
          failures.push(result);
          console.log(`  \x1b[31m\u2717 ${result.name}\x1b[0m`);
          if (result.metadata?.error) {
            // Print first line of error indented
            const errorLines = result.metadata.error.split("\n");
            console.log(`    \x1b[90m${errorLines[0]}\x1b[0m`);
          }
        } else {
          passed++;
        }
      }
      yield* each.next();
    }
  });

  // Wait for process to complete
  const { code } = yield* proc.join();

  return {
    version,
    packages,
    failures,
    passed,
    exitCode: code ?? 1,
  };
}

function printSummaryTable(results: GroupResult[]): void {
  console.log(`\n${"=".repeat(70)}`);
  console.log("Compatibility Test Summary");
  console.log(`${"=".repeat(70)}\n`);

  // Header
  console.log(
    `${"Version".padEnd(15)}${"Packages".padEnd(10)}${"Passed".padEnd(10)}${"Failed".padEnd(10)}Status`,
  );
  console.log("-".repeat(55));

  // Rows
  for (const result of results) {
    const status =
      result.failures.length === 0
        ? "\x1b[32mPASS\x1b[0m"
        : "\x1b[31mFAIL\x1b[0m";
    console.log(
      `${result.version.padEnd(15)}${String(result.packages.length).padEnd(10)}${String(result.passed).padEnd(10)}${String(result.failures.length).padEnd(10)}${status}`,
    );
  }
}

function printFailureDetails(results: GroupResult[]): void {
  const totalFailures = results.reduce((sum, r) => sum + r.failures.length, 0);

  if (totalFailures === 0) {
    return;
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Failures (${totalFailures})`);
  console.log("=".repeat(70));

  for (const result of results) {
    if (result.failures.length === 0) continue;

    for (const failure of result.failures) {
      console.log(
        `\n\x1b[31m[Effection ${result.version}]\x1b[0m ${failure.name}`,
      );

      if (failure.metadata?.location) {
        console.log(`  Location: ${failure.metadata.location}`);
      }

      if (failure.metadata?.error) {
        console.log(`  Error: ${failure.metadata.error}`);
      }

      if (failure.metadata?.stack) {
        console.log("  Stack:");
        const stackLines = failure.metadata.stack.split("\n");
        for (const line of stackLines.slice(0, 5)) {
          console.log(`    ${line}`);
        }
        if (stackLines.length > 5) {
          console.log(`    ... (${stackLines.length - 5} more lines)`);
        }
      }
    }
  }
}

await main(function* () {
  console.log("Effection Compatibility Test Runner");
  console.log("====================================\n");

  console.log("Resolving version groups...");
  const groups = yield* resolveVersionGroups();
  const versionList = groups.map((g) => g.version).join(", ");
  console.log(
    `\nWill test against ${groups.length} Effection versions: ${versionList}\n`,
  );

  const results: GroupResult[] = [];

  for (const group of groups) {
    const { version, packages } = group;
    const filters = packages.map((pkg) => `--filter=${pkg}`).join(" ");

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing with Effection ${version}`);
    console.log(`Packages: ${packages.join(", ")}`);
    console.log("=".repeat(60));

    console.log(`\n[1/3] Setting override to effection@${version}...`);
    yield* runCommand(
      `pnpm config set --location project pnpm.overrides.effection=${version}`,
    );

    console.log("[2/3] Installing dependencies...");
    yield* runCommand("pnpm install --no-frozen-lockfile");

    console.log("[3/3] Running tests...\n");
    const result = yield* runTestsWithTap(filters, version, packages);
    results.push(result);

    const status =
      result.failures.length === 0
        ? "\x1b[32mPASS\x1b[0m"
        : `\x1b[31mFAIL (${result.failures.length} failures)\x1b[0m`;
    console.log(`\nCompleted: ${result.passed} passed, ${status}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Cleaning up...");
  console.log("=".repeat(60));

  // Remove .npmrc created by pnpm config set
  const npmrcPath = path.join(rootDir, ".npmrc");
  if (fs.existsSync(npmrcPath)) {
    fs.unlinkSync(npmrcPath);
    console.log("Removed .npmrc");
  }

  yield* runCommand("pnpm install --no-frozen-lockfile");

  // Print summary
  printSummaryTable(results);
  printFailureDetails(results);

  // Set exit code if any failures
  const hasFailures = results.some((r) => r.failures.length > 0);
  if (hasFailures) {
    process.exitCode = 1;
    console.log("\n\x1b[31mCompatibility tests failed!\x1b[0m");
  } else {
    console.log("\n\x1b[32mAll compatibility tests passed!\x1b[0m");
  }
});
