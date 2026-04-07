import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { readTextFile } from "@effectionx/fs";
import { exec } from "@effectionx/process";
import { type Operation, main } from "effection";
import G from "generatorics";
import semver from "semver";

// Parse CLI args for verbose mode
const verbose =
  process.argv.includes("-v") || process.argv.includes("--verbose");

// Types for peer dependency version resolution
type PeerDepVersions = {
  name: string; // "effection", "vitest", etc.
  range: string; // "^3 || ^4"
  versions: string[]; // ["3.0.0", "4.0.0"] - resolved min/max
};

type PackageInfo = {
  name: string; // "@effectionx/vitest"
  dir: string;
  peerDeps: PeerDepVersions[];
};

type MatrixEntry = {
  overrides: Record<string, string>; // { effection: "3.0.0", vitest: "3.0.0" }
  packages: string[];
};

type MatrixResult = {
  overrides: Record<string, string>;
  packages: string[];
  failures: { name: string; error?: string }[];
  passed: number;
  failed: number;
  skipped: number;
  total: number;
  exitCode: number;
};

type VitestAssertionResult = {
  fullName: string;
  status: "passed" | "failed" | "pending" | "skipped" | "todo";
  failureMessages: string[];
};

type VitestFileResult = {
  assertionResults: VitestAssertionResult[];
};

type VitestJsonReport = {
  numTotalTests: number;
  numPassedTests: number;
  numFailedTests: number;
  numPendingTests: number;
  numTodoTests: number;
  testResults: VitestFileResult[];
};

const rootDir = process.cwd();
const isGitHubActions = process.env.GITHUB_ACTIONS === "true";
const vitestReportPath = path.join(
  rootDir,
  ".internal",
  "vitest-matrix-report.json",
);

function groupStart(title: string): void {
  if (isGitHubActions) {
    console.log(`::group::${title.replace(/\r?\n/g, " ")}`);
  } else {
    console.log(`\n>>> ${title}`);
  }
}

function groupEnd(): void {
  if (isGitHubActions) {
    console.log("::endgroup::");
  }
}

const runCommand = (command: string) => exec(command).expect();

const readJson = function* <T>(filePath: string): Operation<T> {
  const raw = yield* readTextFile(filePath);
  return JSON.parse(raw) as T;
};

// Cache for npm package versions to avoid refetching
const versionCache = new Map<string, string[]>();

const fetchPackageVersions = function* (
  packageName: string,
): Operation<string[]> {
  const cached = versionCache.get(packageName);
  if (cached) {
    return cached;
  }

  const { stdout } = yield* runCommand(
    `npm view ${packageName} versions --json`,
  );
  const versions = JSON.parse(stdout) as string[];
  versionCache.set(packageName, versions);

  return versions;
};

const resolveVersionPair = (
  allVersions: string[],
  range: string,
): { min: string; max: string } => {
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

    // Skip if package.json doesn't exist
    if (!fs.existsSync(pkgPath)) continue;

    const pkg = yield* readJson<{
      name: string;
      peerDependencies?: Record<string, string>;
    }>(pkgPath);

    const peerDeps: PeerDepVersions[] = [];

    if (pkg.peerDependencies) {
      groupStart(`Fetching ${pkg.name} peer dep versions from npm...`);
      for (const [depName, range] of Object.entries(pkg.peerDependencies)) {
        const allVersions = yield* fetchPackageVersions(depName);
        const { min, max } = resolveVersionPair(allVersions, range);

        // Dedupe if min equals max
        const versions = min === max ? [min] : [min, max];

        peerDeps.push({ name: depName, range, versions });
        console.log(`    ${pkg.name} -> ${depName}: ${versions.join(", ")}`);
      }
      groupEnd();
    }

    packages.push({ name: pkg.name, dir, peerDeps });
  }

  return packages;
};

const generateMatrix = (packages: PackageInfo[]): MatrixEntry[] => {
  const matrix: MatrixEntry[] = [];

  for (const pkg of packages) {
    if (pkg.peerDeps.length === 0) continue;

    const depNames = pkg.peerDeps.map((d) => d.name);
    const depVersionArrays = pkg.peerDeps.map((d) => d.versions);

    // Use generatorics for cartesian product
    for (const combo of G.clone.cartesian(...depVersionArrays)) {
      const overrides: Record<string, string> = {};
      for (let i = 0; i < depNames.length; i++) {
        overrides[depNames[i]] = combo[i];
      }

      // Create a sorted key for comparison
      const sortedKeys = Object.keys(overrides).sort();
      const key = JSON.stringify(
        sortedKeys.reduce(
          (obj, k) => {
            obj[k] = overrides[k];
            return obj;
          },
          {} as Record<string, string>,
        ),
      );

      // Find or create matrix entry with same overrides
      let entry = matrix.find((e) => {
        const eSortedKeys = Object.keys(e.overrides).sort();
        const eKey = JSON.stringify(
          eSortedKeys.reduce(
            (obj, k) => {
              obj[k] = e.overrides[k];
              return obj;
            },
            {} as Record<string, string>,
          ),
        );
        return eKey === key;
      });

      if (!entry) {
        entry = { overrides, packages: [] };
        matrix.push(entry);
      }

      if (!entry.packages.includes(pkg.name)) {
        entry.packages.push(pkg.name);
      }
    }
  }

  // Sort for consistent ordering
  return matrix.sort((a, b) => {
    const aKeys = Object.keys(a.overrides).sort();
    const bKeys = Object.keys(b.overrides).sort();
    const aKey = JSON.stringify(aKeys.map((k) => `${k}:${a.overrides[k]}`));
    const bKey = JSON.stringify(bKeys.map((k) => `${k}:${b.overrides[k]}`));
    return aKey < bKey ? -1 : 1;
  });
};

function* runTestsWithVitest(
  overrides: Record<string, string>,
  packages: string[],
): Operation<MatrixResult> {
  const failures: { name: string; error?: string }[] = [];

  // Build package path filters from package names.
  // We intentionally pass directories (e.g. "fx") rather than glob strings
  // like "fx/**/*.test.ts" because this command is executed without a shell,
  // so globs are not expanded before reaching Vitest.
  const testPatterns = packages.map((pkg) => {
    const shortName = pkg.replace("@effectionx/", "");
    return shortName;
  });

  const arguments_ = [
    "--env-file=.env",
    "./node_modules/vitest/vitest.mjs",
    "run",
    `--reporter=default`,
    `--reporter=json`,
    `--outputFile=${vitestReportPath}`,
    ...testPatterns,
  ];
  if (verbose) {
    arguments_.splice(6, 0, "--reporter=verbose");
  }

  if (fs.existsSync(vitestReportPath)) {
    fs.unlinkSync(vitestReportPath);
  }

  // Run vitest through node with .env loaded so matrix runs use the same
  // runtime conditions as the root `pnpm test` command.
  const { code, stdout, stderr } = yield* exec("node", {
    arguments: arguments_,
    env: {
      ...process.env,
    } as Record<string, string>,
  }).join();
  const exitCode = code ?? 1;

  if (verbose && (stdout || stderr)) {
    if (stdout) {
      console.log(stdout);
    }
    if (stderr) {
      console.error(stderr);
    }
  }

  let report: VitestJsonReport | null = null;
  if (fs.existsSync(vitestReportPath)) {
    report = JSON.parse(
      yield* readTextFile(vitestReportPath),
    ) as VitestJsonReport;
    fs.unlinkSync(vitestReportPath);
  }

  if (report) {
    for (const file of report.testResults) {
      for (const assertion of file.assertionResults) {
        if (assertion.status === "failed") {
          failures.push({
            name: assertion.fullName,
            error: assertion.failureMessages[0],
          });
        }
      }
    }
  }

  if (exitCode !== 0) {
    const diagnostic = [stderr, stdout]
      .filter(Boolean)
      .join("\n")
      .trim()
      .slice(0, 1600);

    if (failures.length === 0) {
      failures.push({
        name: "vitest run failed",
        error: diagnostic
          ? `vitest exited with code ${exitCode}\n${diagnostic}`
          : `vitest exited with code ${exitCode}`,
      });
    }
  }

  const passed = report?.numPassedTests ?? 0;
  const failed = Math.max(report?.numFailedTests ?? 0, failures.length);
  const skipped = (report?.numPendingTests ?? 0) + (report?.numTodoTests ?? 0);
  const total = Math.max(report?.numTotalTests ?? 0, passed + failed + skipped);

  return {
    overrides,
    packages,
    failures,
    passed,
    failed,
    skipped,
    total,
    exitCode,
  };
}

function printSummaryTable(results: MatrixResult[]): void {
  // Collect all unique override keys across all results
  const allKeys = new Set<string>();
  for (const r of results) {
    for (const key of Object.keys(r.overrides)) {
      allKeys.add(key);
    }
  }
  const keys = Array.from(allKeys).sort();

  console.log(`\n${"=".repeat(70)}`);
  console.log("Peer Dependency Matrix Test Summary");
  console.log(`${"=".repeat(70)}\n`);

  // Dynamic header based on which deps are being tested
  const cols = [
    ...keys,
    "Packages",
    "Passed",
    "Failed",
    "Skipped",
    "Rate",
    "Status",
  ];
  const widths = cols.map((c) => Math.max(c.length + 2, 12));

  const header = cols.map((c, i) => c.padEnd(widths[i])).join("");
  console.log(header);
  console.log("-".repeat(header.length));

  for (const result of results) {
    const status =
      result.failed === 0
        ? "\x1b[32mPASS\x1b[0m"
        : "\x1b[31mFAIL\x1b[0m";

    const attempted = result.passed + result.failed;
    const rate =
      attempted === 0
        ? "-"
        : `${Math.round((result.passed / attempted) * 100)}%`;

    const values = [
      ...keys.map((k) => result.overrides[k] ?? "-"),
      String(result.packages.length),
      String(result.passed),
      String(result.failed),
      String(result.skipped),
      rate,
      status,
    ];

    const row = values.map((v, i) => v.padEnd(widths[i])).join("");
    console.log(row);
  }
}

function printFailureDetails(results: MatrixResult[]): void {
  const totalFailures = results.reduce((sum, r) => sum + r.failures.length, 0);

  if (totalFailures === 0) {
    return;
  }

  console.log(`\n${"=".repeat(70)}`);
  console.log(`Failures (${totalFailures})`);
  console.log("=".repeat(70));

  for (const result of results) {
    if (result.failures.length === 0) continue;

    const overrideStr = Object.entries(result.overrides)
      .map(([k, v]) => `${k}@${v}`)
      .join(", ");

    for (const failure of result.failures) {
      console.log(`\n\x1b[31m[${overrideStr}]\x1b[0m ${failure.name}`);
      if (failure.error) {
        console.log(`  Error: ${failure.error}`);
      }
    }
  }
}

await main(function* () {
  console.log("Peer Dependency Matrix Test Runner");
  console.log("===================================\n");

  console.log("Resolving packages and peer dependencies...");
  const packages = yield* getWorkspacePackages();

  console.log("Generating test matrix...");
  const matrix = generateMatrix(packages);

  if (matrix.length === 0) {
    console.log("No packages with peer dependencies found.");
    return;
  }

  console.log(`\nGenerated ${matrix.length} matrix entries to test.\n`);

  const results: MatrixResult[] = [];

  for (const [index, entry] of matrix.entries()) {
    const overrideStr = Object.entries(entry.overrides)
      .map(([k, v]) => `${k}@${v}`)
      .join(", ");

    groupStart(`Matrix ${index + 1}/${matrix.length}: ${overrideStr}`);

    console.log(`\n${"=".repeat(60)}`);
    console.log(`Testing with: ${overrideStr}`);
    console.log(`Packages: ${entry.packages.join(", ")}`);
    console.log("=".repeat(60));

    console.log("\n[1/3] Setting overrides...");
    for (const [pkg, version] of Object.entries(entry.overrides)) {
      yield* runCommand(
        `pnpm config set --location project pnpm.overrides.${pkg}=${version}`,
      );
    }

    console.log("[2/3] Installing dependencies...");
    yield* runCommand("pnpm install --no-frozen-lockfile");

    console.log("[3/3] Running tests...\n");
    const result = yield* runTestsWithVitest(entry.overrides, entry.packages);
    results.push(result);

    const status =
      result.failed === 0
        ? "\x1b[32mPASS\x1b[0m"
        : `\x1b[31mFAIL (${result.failed} failures)\x1b[0m`;
    console.log(`\nCompleted: ${status}`);
    groupEnd();
  }

  groupStart("Cleanup and restore dependencies");
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
  groupEnd();

  // Print summary
  printSummaryTable(results);
  printFailureDetails(results);

  // Set exit code if any failures
  const hasFailures = results.some((r) => r.failed > 0);
  if (hasFailures) {
    process.exitCode = 1;
    console.log("\n\x1b[31mMatrix tests failed!\x1b[0m");
  } else {
    console.log("\n\x1b[32mAll matrix tests passed!\x1b[0m");
  }
});
