import path from "node:path";
import process from "node:process";
import { readTextFile } from "@effectionx/fs";
import { exec } from "@effectionx/process";
import { type Operation, run } from "effection";
import semver from "semver";

type PackageInfo = { name: string; dir: string; peerRange: string | null };

type VersionPair = { min: string; max: string };

type VersionGroup = { version: string; packages: string[] };

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
  const lines = workspace
    .split(/\r?\n/)
    .filter((line) => line.trim().startsWith("-"));
  const entries = lines.map((line) =>
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

const main = function* (): Operation<void> {
  console.log("Effection Compatibility Test Runner");
  console.log("====================================\n");

  console.log("Resolving version groups...");
  const groups = yield* resolveVersionGroups();
  const versionList = groups.map((g) => g.version).join(", ");
  console.log(
    `\nWill test against ${groups.length} Effection versions: ${versionList}\n`,
  );

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

    console.log("[3/3] Running tests...");
    yield* runCommand(`pnpm turbo run test ${filters}`);

    console.log(`\n Completed tests for Effection ${version}`);
  }

  console.log(`\n${"=".repeat(60)}`);
  console.log("Cleaning up...");
  console.log("=".repeat(60));

  yield* runCommand(
    "pnpm config delete --location project pnpm.overrides.effection",
  );
  yield* runCommand("pnpm install --no-frozen-lockfile");

  console.log("\n All compatibility tests complete!");
};

run(main);
