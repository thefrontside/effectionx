import { promises as fsp } from "node:fs";
import type { Dirent } from "node:fs";
import path from "node:path";
import process from "node:process";
import { exists, readTextFile, writeTextFile } from "@effectionx/fs";
import { type Operation, call, main } from "effection";

const rootDir = path.resolve(process.cwd());
const workspaceFile = path.join(rootDir, "pnpm-workspace.yaml");
const rootTestConfigPath = path.join(rootDir, "tsconfig.test.json");

const mode = process.argv[2] ?? "update";
const isCheckMode = mode === "check";
const isFixMode = mode === "fix";

if (!["update", "check", "fix"].includes(mode)) {
  throw new Error("Usage: node tasks/sync-tsrefs.ts [check|fix]");
}

type PackageInfo = {
  name: string;
  dir: string;
  tsconfigPath: string;
  packageJsonPath: string;
};

type JsonObject = Record<string, unknown>;

type TsConfig = {
  references?: Array<{ path: string }>;
  [key: string]: unknown;
};

type TestConfig = {
  path: string;
  baseDir: string;
  include: string[];
  exclude: string[];
  includeRegex: RegExp[];
  excludeRegex: RegExp[];
};

type ImportUsage = {
  testFiles: Set<string>;
  runtimeFiles: Set<string>;
};

const globChars = new Set(["*", "?", "[", "]", "{"]);

// Format JSON with stable indentation and trailing newline.
const formatJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

// Normalize path separators for cross-platform logging.
const toPosixPath = (value: string) => value.replace(/\\/g, "/");

// Parse pnpm-workspace.yaml and return explicit package paths.
function* getWorkspaceEntries(): Operation<string[]> {
  let raw = "";
  try {
    raw = yield* readTextFile(workspaceFile);
  } catch (error) {
    throw new Error(`Failed to read ${workspaceFile}: ${String(error)}`);
  }

  const lines = raw.split(/\r?\n/);
  const entries: string[] = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed.startsWith("-")) {
      continue;
    }
    const value = trimmed
      .replace(/^-\s*/, "")
      .replace(/^"|"$/g, "")
      .replace(/^'|'$/g, "");
    if (!value) {
      continue;
    }
    entries.push(value);
  }

  if (entries.length === 0) {
    throw new Error("No workspace packages found in pnpm-workspace.yaml");
  }

  for (const entry of entries) {
    if ([...entry].some((char) => globChars.has(char))) {
      throw new Error(
        `Workspace entry '${entry}' includes glob characters; add explicit package paths.`,
      );
    }
  }

  return entries;
}

// Read and parse a JSON file with helpful error messages.
function* readJson<T extends JsonObject>(filePath: string): Operation<T> {
  let raw = "";
  try {
    raw = yield* readTextFile(filePath);
  } catch (error) {
    throw new Error(`Failed to read ${filePath}: ${String(error)}`);
  }
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    throw new Error(`Failed to parse JSON in ${filePath}: ${String(error)}`);
  }
}

// Compute the relative path for a tsconfig project reference.
const pathForReference = (fromDir: string, toDir: string) => {
  const relativePath = toPosixPath(path.relative(fromDir, toDir));
  if (!relativePath) {
    return ".";
  }
  if (relativePath.startsWith(".")) {
    return relativePath;
  }
  return `./${relativePath}`;
};

// Load package.json metadata for each workspace entry.
function* collectPackages(entries: string[]): Operation<PackageInfo[]> {
  const packages: PackageInfo[] = [];

  for (const entry of entries) {
    const packageDir = path.join(rootDir, entry);
    const packageJsonPath = path.join(packageDir, "package.json");
    const tsconfigPath = path.join(packageDir, "tsconfig.json");

    let packageJson: JsonObject;
    try {
      packageJson = yield* readJson(packageJsonPath);
    } catch (error) {
      throw new Error(
        `Workspace entry '${entry}' is missing a valid package.json: ${String(error)}`,
      );
    }

    const name = packageJson.name;
    if (typeof name !== "string" || !name) {
      throw new Error(`Missing or invalid name in ${packageJsonPath}`);
    }

    packages.push({ name, dir: packageDir, tsconfigPath, packageJsonPath });
  }

  return packages;
}

// Collect workspace dependencies from dependencies and peerDependencies.
const getWorkspaceDeps = (
  packageJson: JsonObject,
  workspaceNames: Set<string>,
) => {
  const deps = packageJson.dependencies ?? {};
  const peerDeps = packageJson.peerDependencies ?? {};
  const result = new Set<string>();

  if (typeof deps === "object" && deps) {
    for (const name of Object.keys(deps)) {
      if (workspaceNames.has(name)) {
        result.add(name);
      }
    }
  }

  if (typeof peerDeps === "object" && peerDeps) {
    for (const name of Object.keys(peerDeps)) {
      if (workspaceNames.has(name)) {
        result.add(name);
      }
    }
  }

  return [...result].sort((a, b) => a.localeCompare(b));
};

// Recursively gather TypeScript source files for a package.
function* collectSourceFiles(packageDir: string): Operation<string[]> {
  const entries: string[] = [];
  const stack = [packageDir];
  const ignoreDirs = new Set(["dist", "node_modules", ".git"]);
  const allowedExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

  while (stack.length > 0) {
    const dir = stack.pop();
    if (!dir) {
      continue;
    }

    let dirEntries: Array<Dirent> = [];
    try {
      dirEntries = yield* call(() => fsp.readdir(dir, { withFileTypes: true }));
    } catch (error) {
      throw new Error(`Failed to read directory ${dir}: ${String(error)}`);
    }

    for (const entry of dirEntries) {
      const entryPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!ignoreDirs.has(entry.name)) {
          stack.push(entryPath);
        }
        continue;
      }

      if (!entry.isFile()) {
        continue;
      }

      const ext = path.extname(entry.name);
      if (allowedExtensions.has(ext)) {
        entries.push(entryPath);
      }
    }
  }

  return entries;
}

// Resolve a workspace package name from an import specifier.
const resolveWorkspaceImport = (
  specifier: string,
  workspaceNames: string[],
) => {
  for (const name of workspaceNames) {
    if (specifier === name || specifier.startsWith(`${name}/`)) {
      return name;
    }
  }
  return null;
};

const escapeRegex = (value: string) =>
  value.replace(/[.+^${}()|[\]\\]/g, "\\$&");

// Convert a tsconfig glob pattern to a RegExp.
const globToRegExp = (pattern: string) => {
  let value = toPosixPath(pattern).replace(/^\.\//, "");
  const hasGlob = /[*?{[]/.test(value);

  if (!hasGlob) {
    const ext = path.posix.extname(value);
    if (!ext || value.endsWith("/")) {
      value = value.replace(/\/?$/, "/**/*");
    }
  }

  let regex = "^";

  for (let index = 0; index < value.length; index += 1) {
    const char = value[index];

    if (char === "*") {
      if (value[index + 1] === "*") {
        regex += ".*";
        index += 1;
      } else {
        regex += "[^/]*";
      }
      continue;
    }

    if (char === "?") {
      regex += "[^/]";
      continue;
    }

    if (char === "{") {
      const end = value.indexOf("}", index + 1);
      if (end > -1) {
        const inner = value.slice(index + 1, end);
        const parts = inner.split(",").map((part) => escapeRegex(part));
        regex += `(?:${parts.join("|")})`;
        index = end;
        continue;
      }
    }

    regex += escapeRegex(char);
  }

  regex += "$";
  return new RegExp(regex);
};

const compilePatterns = (patterns: string[]) =>
  patterns.map((pattern) => globToRegExp(pattern));

const matchesAny = (value: string, patterns: RegExp[]) =>
  patterns.some((pattern) => pattern.test(value));

// Load tsconfig.test.json and precompile include/exclude patterns.
function* loadTestConfig(configPath: string): Operation<TestConfig> {
  const config = yield* readJson<JsonObject>(configPath);
  const include = Array.isArray(config.include)
    ? config.include.filter((item): item is string => typeof item === "string")
    : [];
  const exclude = Array.isArray(config.exclude)
    ? config.exclude.filter((item): item is string => typeof item === "string")
    : [];

  return {
    path: configPath,
    baseDir: path.dirname(configPath),
    include,
    exclude,
    includeRegex: compilePatterns(include),
    excludeRegex: compilePatterns(exclude),
  };
}

// Find the nearest tsconfig.test.json walking up to the package root.
function* findNearestTestConfig(
  startDir: string,
  stopDir: string,
  cache: Map<string, string | null>,
): Operation<string | null> {
  let current = startDir;
  const visited: string[] = [];

  while (true) {
    if (cache.has(current)) {
      const cached = cache.get(current) ?? null;
      for (const dir of visited) {
        cache.set(dir, cached);
      }
      return cached;
    }

    visited.push(current);
    const candidate = path.join(current, "tsconfig.test.json");
    if (yield* exists(candidate)) {
      for (const dir of visited) {
        cache.set(dir, candidate);
      }
      return candidate;
    }

    if (current === stopDir) {
      break;
    }

    const parent = path.dirname(current);
    if (parent === current) {
      break;
    }
    current = parent;
  }

  for (const dir of visited) {
    cache.set(dir, null);
  }

  return null;
}

const isTestFile = (filePath: string, testConfig: TestConfig) => {
  if (testConfig.include.length === 0) {
    return false;
  }

  const relativePath = toPosixPath(path.relative(testConfig.baseDir, filePath));
  if (relativePath.startsWith("..")) {
    return false;
  }

  const included = matchesAny(relativePath, testConfig.includeRegex);
  if (!included) {
    return false;
  }

  if (testConfig.exclude.length === 0) {
    return true;
  }

  return !matchesAny(relativePath, testConfig.excludeRegex);
};

// Scan source files for workspace package imports.
function* findWorkspaceImports(
  packageDir: string,
  workspaceNames: string[],
  getTestConfigForFile: (filePath: string) => Operation<TestConfig | null>,
): Operation<Map<string, ImportUsage>> {
  const files = yield* collectSourceFiles(packageDir);
  const matches = new Map<string, ImportUsage>();
  const importFromRegex = /(?:import|export)\s+[^"']*from\s+["']([^"']+)["']/g;
  const importBareRegex = /import\s+["']([^"']+)["']/g;
  const dynamicImportRegex = /import\(\s*["']([^"']+)["']\s*\)/g;

  for (const filePath of files) {
    let content = "";
    try {
      content = yield* readTextFile(filePath);
    } catch (error) {
      throw new Error(`Failed to read ${filePath}: ${String(error)}`);
    }

    const testConfig = yield* getTestConfigForFile(filePath);
    const fileIsTest = testConfig ? isTestFile(filePath, testConfig) : false;

    const applyMatches = (regex: RegExp) => {
      regex.lastIndex = 0;
      let match: RegExpExecArray | null = regex.exec(content);
      while (match !== null) {
        const specifier = match[1];
        if (!specifier) {
          match = regex.exec(content);
          continue;
        }
        const workspaceName = resolveWorkspaceImport(specifier, workspaceNames);
        if (workspaceName) {
          if (!matches.has(workspaceName)) {
            matches.set(workspaceName, {
              testFiles: new Set(),
              runtimeFiles: new Set(),
            });
          }
          const entry = matches.get(workspaceName);
          if (!entry) {
            match = regex.exec(content);
            continue;
          }
          if (fileIsTest) {
            entry.testFiles.add(filePath);
          } else {
            entry.runtimeFiles.add(filePath);
          }
        }
        match = regex.exec(content);
      }
    };

    applyMatches(importFromRegex);
    applyMatches(importBareRegex);
    applyMatches(dynamicImportRegex);
  }

  return matches;
}

const getDependencyObject = (value: unknown) =>
  value && typeof value === "object"
    ? { ...(value as Record<string, string>) }
    : {};

// Update or verify tsconfig project references for all packages.
function* updateReferences(): Operation<void> {
  const entries = yield* getWorkspaceEntries();
  const packages = yield* collectPackages(entries);
  const workspaceMap = new Map(packages.map((pkg) => [pkg.name, pkg]));
  const workspaceNames = new Set(workspaceMap.keys());
  const workspaceNameList = [...workspaceNames].sort((a, b) =>
    a.localeCompare(b),
  );

  const warnings: string[] = [];
  const mismatches: string[] = [];
  const dependencyIssues: string[] = [];
  const updatedPackageJsons: string[] = [];

  let rootTestConfig: TestConfig | null = null;
  if (yield* exists(rootTestConfigPath)) {
    rootTestConfig = yield* loadTestConfig(rootTestConfigPath);
  } else {
    warnings.push(
      "Missing tsconfig.test.json at repo root; test-only classification defaults to runtime.",
    );
  }

  for (const pkg of packages) {
    const packageJson = yield* readJson<JsonObject>(pkg.packageJsonPath);
    const workspaceDeps = getWorkspaceDeps(packageJson, workspaceNames);

    const testConfigPathCache = new Map<string, string | null>();
    const testConfigCache = new Map<string, TestConfig>();

    function* getTestConfigForFile(
      filePath: string,
    ): Operation<TestConfig | null> {
      const dir = path.dirname(filePath);
      const nearest = yield* findNearestTestConfig(
        dir,
        pkg.dir,
        testConfigPathCache,
      );
      const resolved = nearest ?? rootTestConfig?.path ?? null;

      if (!resolved) {
        return null;
      }

      if (rootTestConfig && resolved === rootTestConfig.path) {
        return rootTestConfig;
      }

      if (testConfigCache.has(resolved)) {
        return testConfigCache.get(resolved) ?? null;
      }

      const loaded = yield* loadTestConfig(resolved);
      testConfigCache.set(resolved, loaded);
      return loaded;
    }

    const workspaceImports = yield* findWorkspaceImports(
      pkg.dir,
      workspaceNameList,
      getTestConfigForFile,
    );
    const mergedDeps = new Set([...workspaceDeps, ...workspaceImports.keys()]);
    mergedDeps.delete(pkg.name);
    const orderedDeps = [...mergedDeps].sort((a, b) => a.localeCompare(b));

    let tsconfigRaw = "";
    try {
      tsconfigRaw = yield* readTextFile(pkg.tsconfigPath);
    } catch (error) {
      warnings.push(`Skipping ${pkg.tsconfigPath}: ${String(error)}`);
      continue;
    }

    let tsconfig: TsConfig;
    try {
      tsconfig = JSON.parse(tsconfigRaw) as TsConfig;
    } catch (error) {
      throw new Error(
        `Failed to parse JSON in ${pkg.tsconfigPath}: ${String(error)}`,
      );
    }

    const nextReferences = orderedDeps
      .map((depName) => {
        const dep = workspaceMap.get(depName);
        if (!dep) {
          return null;
        }
        return { path: pathForReference(pkg.dir, dep.dir) };
      })
      .filter(Boolean) as Array<{ path: string }>;

    const currentReferences = Array.isArray(tsconfig.references)
      ? tsconfig.references
          .map((ref) =>
            typeof ref?.path === "string" ? { path: ref.path } : null,
          )
          .filter((ref): ref is { path: string } => Boolean(ref))
      : [];

    const normalize = (refs: Array<{ path: string }>) =>
      refs
        .map((ref) => ({ path: ref.path }))
        .sort((a, b) => a.path.localeCompare(b.path));

    const normalizedCurrent = normalize(currentReferences);
    const normalizedNext = normalize(nextReferences);

    const hasMismatch =
      normalizedCurrent.length !== normalizedNext.length ||
      normalizedCurrent.some(
        (ref, index) => ref.path !== normalizedNext[index]?.path,
      );

    if (hasMismatch) {
      mismatches.push(pkg.tsconfigPath);
      if (!isCheckMode) {
        tsconfig.references = nextReferences;
        yield* writeTextFile(pkg.tsconfigPath, formatJson(tsconfig));
      }
    }

    const dependencies = getDependencyObject(packageJson.dependencies);
    const devDependencies = getDependencyObject(packageJson.devDependencies);
    const peerDependencies = getDependencyObject(packageJson.peerDependencies);

    const declaredDeps = new Set([
      ...Object.keys(dependencies),
      ...Object.keys(devDependencies),
      ...Object.keys(peerDependencies),
    ]);

    const updatedDeps = { dependencies, devDependencies, peerDependencies };
    let depsChanged = false;

    for (const [depName, usage] of workspaceImports) {
      const hasRuntime = usage.runtimeFiles.size > 0;
      const hasTest = usage.testFiles.size > 0;

      const inDependencies = Boolean(dependencies[depName]);
      const inPeerDependencies = Boolean(peerDependencies[depName]);
      const inDevDependencies = Boolean(devDependencies[depName]);

      if (hasRuntime) {
        if (!inDependencies && !inPeerDependencies) {
          if (isFixMode) {
            if (inDevDependencies) {
              delete devDependencies[depName];
              depsChanged = true;
            }
            if (!dependencies[depName]) {
              dependencies[depName] = "workspace:*";
              depsChanged = true;
            }
          } else if (isCheckMode && !declaredDeps.has(depName)) {
            dependencyIssues.push(
              `${toPosixPath(path.relative(rootDir, pkg.packageJsonPath))}: add ${depName} to dependencies`,
            );
          } else if (isCheckMode && inDevDependencies) {
            dependencyIssues.push(
              `${toPosixPath(path.relative(rootDir, pkg.packageJsonPath))}: move ${depName} from devDependencies to dependencies`,
            );
          }
        }
        continue;
      }

      if (
        hasTest &&
        !inDependencies &&
        !inPeerDependencies &&
        !inDevDependencies
      ) {
        if (isFixMode) {
          devDependencies[depName] = "workspace:*";
          depsChanged = true;
        } else if (isCheckMode) {
          dependencyIssues.push(
            `${toPosixPath(path.relative(rootDir, pkg.packageJsonPath))}: add ${depName} to devDependencies`,
          );
        }
      }
    }

    if (isFixMode && depsChanged) {
      if (Object.keys(updatedDeps.dependencies).length === 0) {
        packageJson.dependencies = undefined;
      } else {
        packageJson.dependencies = updatedDeps.dependencies;
      }

      if (Object.keys(updatedDeps.devDependencies).length === 0) {
        packageJson.devDependencies = undefined;
      } else {
        packageJson.devDependencies = updatedDeps.devDependencies;
      }

      if (Object.keys(updatedDeps.peerDependencies).length === 0) {
        packageJson.peerDependencies = undefined;
      } else {
        packageJson.peerDependencies = updatedDeps.peerDependencies;
      }

      yield* writeTextFile(pkg.packageJsonPath, formatJson(packageJson));
      updatedPackageJsons.push(pkg.packageJsonPath);
    }
  }

  for (const warning of warnings) {
    console.warn(warning);
  }

  const messages: string[] = [];

  if (mismatches.length > 0) {
    messages.push(
      `tsconfig references out of date: ${mismatches
        .map((file) => toPosixPath(path.relative(rootDir, file)))
        .join(", ")}`,
    );
  }

  if (dependencyIssues.length > 0) {
    messages.push(
      `package dependencies out of date:\n- ${dependencyIssues.join("\n- ")}`,
    );
  }

  if (messages.length > 0) {
    if (isCheckMode) {
      throw new Error(messages.join("\n"));
    }
    for (const message of messages) {
      console.log(message);
    }
  } else {
    console.log("tsconfig references and dependencies are up to date");
  }

  if (updatedPackageJsons.length > 0) {
    console.log(
      `updated package.json files: ${updatedPackageJsons
        .map((file) => toPosixPath(path.relative(rootDir, file)))
        .join(", ")}`,
    );
  }
}

await main(function* () {
  yield* updateReferences();
});
