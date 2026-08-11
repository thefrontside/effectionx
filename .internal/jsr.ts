import { call, main } from "effection";
import { promises as fsp } from "node:fs";
import path from "node:path";
import process from "node:process";
import { z } from "zod";
import { x } from "@effectionx/tinyexec";
import { readPackages } from "./lib/read-packages.ts";

const ExportPath = z
  .string()
  .min(1)
  .refine((value) => value.startsWith("./"), {
    message: "must be a package-relative path starting with './'",
  })
  .refine((value) => !value.split("/").includes(".."), {
    message: "must not include '..' path segments",
  });

const ExportSpecifier = z
  .string()
  .min(1)
  .refine((value) => value === "." || value.startsWith("./"), {
    message: "must be '.' or start with './'",
  });

const JsrExports = z.union([ExportPath, z.record(ExportSpecifier, ExportPath)]);

const JsrConfig = z
  .object({
    exports: JsrExports.optional(),
    imports: z.record(z.string().min(1), z.string().min(1)).optional(),
    include: z.array(ExportPath).optional(),
  })
  .strict();

const PackageJson = z
  .object({
    name: z.string(),
    version: z.string(),
    license: z.string().optional(),
    private: z.boolean().optional(),
    exports: z.unknown().optional(),
    dependencies: z.record(z.string()).optional(),
    peerDependencies: z.record(z.string()).optional(),
    optionalDependencies: z.record(z.string()).optional(),
    scripts: z.record(z.string()).optional(),
    effectionx: z
      .object({
        jsr: JsrConfig.optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

type PackageJson = z.infer<typeof PackageJson>;
type JsrConfig = z.infer<typeof JsrConfig>;
type JsrExports = z.infer<typeof JsrExports>;

type WorkspacePackage = {
  workspace: string;
  workspacePath: string;
  packageJsonPath: string;
  packageJson: PackageJson;
};

type JsrPackage = {
  name: string;
  version: string;
  license?: string;
  exports: JsrExports;
  imports?: Record<string, string>;
  nodeModulesDir: "auto";
};

type MatrixEntry = {
  workspace: string;
  tagname: string;
  name: string;
  version: string;
  firstPublish: boolean;
};

function formatJson(value: unknown): string {
  return `${JSON.stringify(value, null, 2)}\n`;
}

function toPosixPath(value: string): string {
  return value.replace(/\\/g, "/");
}

function assertPackagePath(value: string, field: string): void {
  if (path.isAbsolute(value)) {
    throw new Error(`${field} must be package-relative: ${value}`);
  }

  if (value.split(/[\\/]/).includes("..")) {
    throw new Error(`${field} must not include '..': ${value}`);
  }
}

function readExportTarget(value: unknown): string | undefined {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return undefined;
  }

  const record = value as Record<string, unknown>;
  for (const condition of ["development", "default", "import", "types"]) {
    const target = record[condition];
    if (typeof target === "string") {
      return target;
    }
  }

  return undefined;
}

function deriveExports(exportsValue: unknown, packageName: string): JsrExports {
  if (typeof exportsValue === "string") {
    return ExportPath.parse(exportsValue);
  }

  if (typeof exportsValue !== "object" || exportsValue === null) {
    throw new Error(`${packageName} must define package.json exports`);
  }

  const exportsRecord = exportsValue as Record<string, unknown>;
  const result: Record<string, string> = {};

  for (const [specifier, value] of Object.entries(exportsRecord)) {
    const target = readExportTarget(value);
    if (!target) {
      throw new Error(
        `${packageName} export '${specifier}' does not have a publishable source target`,
      );
    }

    result[ExportSpecifier.parse(specifier)] = ExportPath.parse(target);
  }

  if (Object.keys(result).length === 1 && result["."]) {
    return result["."];
  }

  return z.record(ExportSpecifier, ExportPath).parse(result);
}

function resolveJsrExports(packageJson: PackageJson): JsrExports {
  return (
    packageJson.effectionx?.jsr?.exports ??
    deriveExports(packageJson.exports, packageJson.name)
  );
}

function majorRange(version: string): string {
  const major = version.split(".")[0];
  if (!/^\d+$/.test(major)) {
    throw new Error(`Cannot derive major range from version: ${version}`);
  }

  return major;
}

function normalizeJsrDependencyRange(range: string): string {
  if (!range.includes("||")) {
    return range;
  }

  const alternatives = range
    .split("||")
    .map((alternative) => alternative.trim())
    .filter(Boolean);
  const majors = alternatives
    .map((alternative) => alternative.match(/\d+/)?.[0])
    .filter((major): major is string => Boolean(major));

  if (majors.length === 0) {
    throw new Error(`Cannot normalize dependency range for JSR: ${range}`);
  }

  return majors.sort((a, b) => Number(a) - Number(b)).at(-1) as string;
}

function dependencyEntries(packageJson: PackageJson): Record<string, string> {
  return {
    ...packageJson.dependencies,
    ...packageJson.peerDependencies,
    ...packageJson.optionalDependencies,
  };
}

function workspaceDependencyNames(
  packageJson: PackageJson,
  workspaceNames: Set<string>,
): string[] {
  return Object.keys(dependencyEntries(packageJson))
    .filter((name) => workspaceNames.has(name))
    .sort((a, b) => a.localeCompare(b));
}

function sortByWorkspaceDependencies(
  packages: WorkspacePackage[],
): WorkspacePackage[] {
  const byName = new Map(packages.map((pkg) => [pkg.packageJson.name, pkg]));
  const workspaceNames = new Set(byName.keys());
  const visited = new Set<string>();
  const visiting = new Set<string>();
  const sorted: WorkspacePackage[] = [];

  function visit(pkg: WorkspacePackage): void {
    if (visited.has(pkg.packageJson.name)) {
      return;
    }

    if (visiting.has(pkg.packageJson.name)) {
      throw new Error(
        `Circular workspace dependency involving ${pkg.packageJson.name}`,
      );
    }

    visiting.add(pkg.packageJson.name);
    for (const dependencyName of workspaceDependencyNames(
      pkg.packageJson,
      workspaceNames,
    )) {
      const dependency = byName.get(dependencyName);
      if (dependency) {
        visit(dependency);
      }
    }

    visiting.delete(pkg.packageJson.name);
    visited.add(pkg.packageJson.name);
    sorted.push(pkg);
  }

  for (const pkg of packages) {
    visit(pkg);
  }

  return sorted;
}

function addImport(
  imports: Record<string, string>,
  name: string,
  specifier: string,
): void {
  imports[name] = specifier;
  imports[`${name}/`] = `${specifier}/`;
}

function generatedImports(
  packageJson: PackageJson,
  workspaceVersions: Map<string, string>,
): Record<string, string> | undefined {
  const imports: Record<string, string> = {};

  for (const [name, range] of Object.entries(dependencyEntries(packageJson))) {
    const workspaceVersion = workspaceVersions.get(name);
    if (workspaceVersion) {
      addImport(imports, name, `jsr:${name}@${majorRange(workspaceVersion)}`);
    } else {
      addImport(
        imports,
        name,
        `npm:${name}@${normalizeJsrDependencyRange(range)}`,
      );
    }
  }

  if (Object.keys(imports).length === 0) {
    return undefined;
  }

  return imports;
}

function generatedPackageJson(pkg: WorkspacePackage): Record<string, unknown> {
  return {
    name: pkg.packageJson.name,
    version: pkg.packageJson.version,
    type: "module",
  };
}

function generatedJsrJson(
  pkg: WorkspacePackage,
  workspaceVersions: Map<string, string>,
): JsrPackage {
  const jsrJson: JsrPackage = {
    name: pkg.packageJson.name,
    version: pkg.packageJson.version,
    license: pkg.packageJson.license,
    exports: resolveJsrExports(pkg.packageJson),
    nodeModulesDir: "auto",
  };

  const imports = generatedImports(pkg.packageJson, workspaceVersions);
  if (imports) {
    jsrJson.imports = {
      ...imports,
      ...pkg.packageJson.effectionx?.jsr?.imports,
    };
  } else if (pkg.packageJson.effectionx?.jsr?.imports) {
    jsrJson.imports = pkg.packageJson.effectionx.jsr.imports;
  }

  return jsrJson;
}

function defaultIncludePaths(
  pkg: WorkspacePackage,
  workspaceVersions: Map<string, string>,
): string[] {
  const exports = generatedJsrJson(pkg, workspaceVersions).exports;
  const exportPaths =
    typeof exports === "string" ? [exports] : Object.values(exports);

  return [
    ...exportPaths,
    ...(pkg.packageJson.effectionx?.jsr?.include ?? []),
    "./README.md",
  ];
}

function unique(values: string[]): string[] {
  return [...new Set(values)].sort((a, b) => a.localeCompare(b));
}

function* pathExists(filePath: string) {
  try {
    yield* call(() => fsp.access(filePath));
    return true;
  } catch {
    return false;
  }
}

function* copyPath(source: string, target: string) {
  const stat = yield* call(() => fsp.stat(source));
  if (stat.isDirectory()) {
    yield* call(() => fsp.cp(source, target, { recursive: true }));
  } else {
    yield* call(() => fsp.mkdir(path.dirname(target), { recursive: true }));
    yield* call(() => fsp.copyFile(source, target));
  }
}

function* collectTypeScriptFiles(packageDir: string) {
  const files: string[] = [];
  const stack = [packageDir];
  const ignoredDirs = new Set([
    ".git",
    ".turbo",
    "dist",
    "node_modules",
    "test",
    "test-assets",
    "tests",
    "test-tmp",
  ]);
  const allowedExtensions = new Set([".ts", ".tsx", ".mts", ".cts"]);

  while (stack.length > 0) {
    const current = stack.pop();
    if (!current) {
      continue;
    }

    const entries = yield* call(() =>
      fsp.readdir(current, { withFileTypes: true }),
    );
    for (const entry of entries) {
      const entryPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (!ignoredDirs.has(entry.name)) {
          stack.push(entryPath);
        }
        continue;
      }

      if (
        entry.isFile() &&
        allowedExtensions.has(path.extname(entry.name)) &&
        !entry.name.endsWith(".test.ts") &&
        !entry.name.endsWith(".test.tsx") &&
        !entry.name.endsWith(".vitest.ts")
      ) {
        files.push(`./${toPosixPath(path.relative(packageDir, entryPath))}`);
      }
    }
  }

  return files;
}

function* readWorkspacePackages() {
  const packageSummaries = yield* readPackages();
  const packages: WorkspacePackage[] = [];

  for (const summary of packageSummaries) {
    const packageJsonPath = path.join(summary.workspacePath, "package.json");
    const raw = yield* call(() => fsp.readFile(packageJsonPath, "utf-8"));
    const parsed = PackageJson.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(
        `Invalid ${packageJsonPath}: ${parsed.error.errors
          .map((error) => `${error.path.join(".")}: ${error.message}`)
          .join("; ")}`,
      );
    }

    packages.push({
      workspace: summary.workspace,
      workspacePath: summary.workspacePath,
      packageJsonPath,
      packageJson: parsed.data,
    });
  }

  return packages;
}

function findPackage(packages: WorkspacePackage[], workspace: string) {
  const pkg = packages.find(
    (candidate) =>
      candidate.workspace === workspace ||
      candidate.packageJson.name === workspace,
  );

  if (!pkg) {
    throw new Error(`Unknown package workspace or name: ${workspace}`);
  }

  return pkg;
}

function* stagePackage(
  pkg: WorkspacePackage,
  workspaceVersions: Map<string, string>,
) {
  const stageRoot = yield* call(() =>
    fsp.mkdtemp(path.join("/tmp", `effectionx-jsr-${pkg.workspace}-`)),
  );

  if (pkg.packageJson.scripts?.["jsr:prepare"]) {
    const prepare = yield* x("pnpm", [
      "--dir",
      pkg.workspacePath,
      "run",
      "jsr:prepare",
    ]);
    yield* prepare;
  }

  const includePaths = unique([
    ...(yield* collectTypeScriptFiles(pkg.workspacePath)),
    ...defaultIncludePaths(pkg, workspaceVersions),
  ]);

  for (const includePath of includePaths) {
    assertPackagePath(includePath, "effectionx.jsr.include");
    const source = path.join(pkg.workspacePath, includePath);
    if (!(yield* pathExists(source))) {
      if (includePath === "./README.md") {
        continue;
      }

      throw new Error(
        `${pkg.packageJson.name} include path does not exist: ${includePath}`,
      );
    }

    const target = path.join(stageRoot, includePath);
    yield* copyPath(source, target);
  }

  yield* call(() =>
    fsp.writeFile(
      path.join(stageRoot, "package.json"),
      formatJson(generatedPackageJson(pkg)),
    ),
  );
  yield* call(() =>
    fsp.writeFile(
      path.join(stageRoot, "jsr.json"),
      formatJson(generatedJsrJson(pkg, workspaceVersions)),
    ),
  );

  return stageRoot;
}

function* runJsrPublish(stageRoot: string, dryRun: boolean) {
  const args = ["jsr", "publish", "--allow-slow-types"];
  if (dryRun) {
    args.push("--dry-run");
  }

  const publish = yield* x("npx", args, { nodeOptions: { cwd: stageRoot } });
  const output = yield* publish;
  if (output.stdout.trim()) {
    console.log(output.stdout.trim());
  }

  if (output.stderr.trim()) {
    console.error(output.stderr.trim());
  }

  if (output.exitCode !== 0) {
    throw new Error(`jsr publish failed with exit code ${output.exitCode}`);
  }
}

function githubOutput(name: string, value: string): string {
  return `${name}=${value}`;
}

function* writeGithubOutput(outputValue: string) {
  console.log(outputValue);
  if (process.env.GITHUB_OUTPUT) {
    yield* call(() =>
      fsp.appendFile(process.env.GITHUB_OUTPUT as string, `${outputValue}\n`),
    );
  }
}

function* getJsrPackageMeta(pkg: WorkspacePackage) {
  const packageName = pkg.packageJson.name.replace("@effectionx/", "");
  const response = yield* call(() =>
    fetch(`https://jsr.io/@effectionx/${packageName}/meta.json`, {
      headers: { accept: "application/json" },
    }),
  );

  if (response.status === 404) {
    return { exists: false, versions: new Set<string>() };
  }

  if (!response.ok) {
    throw new Error(
      `Failed to query JSR metadata for ${pkg.packageJson.name}: HTTP ${response.status}`,
    );
  }

  const meta = (yield* call(() => response.json())) as {
    versions?: Record<string, unknown>;
  };

  return {
    exists: true,
    versions: new Set(Object.keys(meta.versions ?? {})),
  };
}

function* createMatrix() {
  const packages = sortByWorkspaceDependencies(yield* readWorkspacePackages());
  const include: MatrixEntry[] = [];

  for (const pkg of packages) {
    if (pkg.packageJson.private) {
      continue;
    }

    const tagname = `${pkg.packageJson.name.split("/")[1]}-v${pkg.packageJson.version}`;
    const meta = yield* getJsrPackageMeta(pkg);
    if (!meta.versions.has(pkg.packageJson.version)) {
      include.push({
        workspace: pkg.workspace,
        tagname,
        name: pkg.packageJson.name,
        version: pkg.packageJson.version,
        firstPublish: !meta.exists,
      });
    }
  }

  const jsrExists = include.length > 0;
  if (!jsrExists) {
    include.push({
      workspace: "nothing",
      tagname: "nothing",
      name: "nothing",
      version: "0.0.0",
      firstPublish: false,
    });
  }

  yield* writeGithubOutput(
    [
      githubOutput("jsr_exists", String(jsrExists)),
      githubOutput("jsr_matrix", JSON.stringify({ include })),
    ].join("\n"),
  );
}

function* inspectConfig(workspace?: string) {
  const allPackages = yield* readWorkspacePackages();
  const workspaceVersions = new Map(
    allPackages.map((pkg) => [pkg.packageJson.name, pkg.packageJson.version]),
  );
  const packages = workspace
    ? [findPackage(allPackages, workspace)]
    : allPackages.filter((pkg) => !pkg.packageJson.private);

  for (const pkg of packages) {
    console.log(formatJson(generatedJsrJson(pkg, workspaceVersions)));
  }
}

function* stage(workspace: string) {
  const packages = yield* readWorkspacePackages();
  const workspaceVersions = new Map(
    packages.map((pkg) => [pkg.packageJson.name, pkg.packageJson.version]),
  );
  const pkg = findPackage(packages, workspace);
  const stageRoot = yield* stagePackage(pkg, workspaceVersions);
  console.log(stageRoot);
}

function* publish(workspace: string, dryRun: boolean) {
  const packages = yield* readWorkspacePackages();
  const workspaceVersions = new Map(
    packages.map((pkg) => [pkg.packageJson.name, pkg.packageJson.version]),
  );
  const selected =
    workspace === "--all"
      ? sortByWorkspaceDependencies(packages).filter(
          (pkg) => !pkg.packageJson.private,
        )
      : [findPackage(packages, workspace)];

  for (const pkg of selected) {
    const stageRoot = yield* stagePackage(pkg, workspaceVersions);
    console.log(
      `${dryRun ? "Dry-run" : "Publishing"} ${pkg.packageJson.name} from ${stageRoot}`,
    );
    yield* runJsrPublish(stageRoot, dryRun);
  }
}

await main(function* () {
  const [command, workspace] = process.argv.slice(2);

  switch (command) {
    case "config":
      yield* inspectConfig(workspace);
      break;
    case "stage":
      if (!workspace) {
        throw new Error("Usage: .internal/jsr.ts stage <workspace>");
      }
      yield* stage(workspace);
      break;
    case "dry-run":
      yield* publish(workspace ?? "--all", true);
      break;
    case "publish":
      if (!workspace) {
        throw new Error("Usage: .internal/jsr.ts publish <workspace>");
      }
      yield* publish(workspace, false);
      break;
    case "matrix":
      yield* createMatrix();
      break;
    default:
      throw new Error(
        "Usage: .internal/jsr.ts <config|stage|dry-run|publish|matrix> [workspace|--all]",
      );
  }
});
