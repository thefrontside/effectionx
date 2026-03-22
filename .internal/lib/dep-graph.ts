import { resolve } from "node:path";
import process from "node:process";
import { readTextFile } from "@effectionx/fs";
import type { Operation } from "effection";

export interface WorkspacePackage {
  /** Package name, e.g. "@effectionx/bdd". */
  name: string;
  /** Current version from package.json. */
  version: string;
  /** Workspace directory name, e.g. "bdd". */
  workspace: string;
  /** Absolute path to workspace directory. */
  workspacePath: string;
  /** True if the package is private. */
  private: boolean;
  /**
   * Names of workspace packages listed in `dependencies` or
   * `peerDependencies` with `workspace:*` protocol.
   */
  publishedWorkspaceDeps: string[];
}

export interface DepGraph {
  /** All non-private workspace packages indexed by name. */
  packages: Map<string, WorkspacePackage>;
  /**
   * Reverse map: package name → names of packages that depend on it
   * via published deps (`dependencies` or `peerDependencies`).
   */
  dependents: Map<string, string[]>;
}

/**
 * Build the published dependency graph for all workspace packages.
 *
 * Only `dependencies` and `peerDependencies` with `workspace:*` are
 * considered because `devDependencies` are stripped at publish time.
 */
export function* buildDepGraph(): Operation<DepGraph> {
  const rootDir = process.cwd();

  const workspaceYaml = yield* readTextFile(
    resolve(rootDir, "pnpm-workspace.yaml"),
  );

  const workspaces: string[] = [];
  for (const line of workspaceYaml.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.startsWith("-")) {
      const value = trimmed.replace(/^-\s*/, "").replace(/^["']|["']$/g, "");
      if (value) {
        workspaces.push(value);
      }
    }
  }

  // Read all package.json files and build WorkspacePackage entries.
  const allPackages: WorkspacePackage[] = [];

  for (const workspace of workspaces) {
    const workspacePath = resolve(rootDir, workspace);
    const raw = yield* readTextFile(resolve(workspacePath, "package.json"));
    const json = JSON.parse(raw) as Record<string, unknown>;

    allPackages.push({
      name: json.name as string,
      version: json.version as string,
      workspace,
      workspacePath,
      private: Boolean(json.private),
      publishedWorkspaceDeps: [], // filled below
    });
  }

  // Index non-private packages by name.
  const packages = new Map<string, WorkspacePackage>();
  for (const pkg of allPackages) {
    if (!pkg.private) {
      packages.set(pkg.name, pkg);
    }
  }

  const packageNames = new Set(packages.keys());

  // Resolve published workspace deps and build reverse map.
  const dependents = new Map<string, string[]>();

  for (const pkg of packages.values()) {
    const raw = yield* readTextFile(resolve(pkg.workspacePath, "package.json"));
    const json = JSON.parse(raw) as Record<string, unknown>;

    const deps = collectWorkspaceDeps(
      json.dependencies as Record<string, string> | undefined,
      packageNames,
    );
    const peerDeps = collectWorkspaceDeps(
      json.peerDependencies as Record<string, string> | undefined,
      packageNames,
    );

    const combined = [...new Set([...deps, ...peerDeps])].sort();
    pkg.publishedWorkspaceDeps = combined;

    for (const dep of combined) {
      if (!dependents.has(dep)) {
        dependents.set(dep, []);
      }
      dependents.get(dep)!.push(pkg.name);
    }
  }

  return { packages, dependents };
}

/**
 * Walk the dependency graph and return all transitive dependents of the
 * given root package names.
 */
export function getTransitiveDependents(
  graph: DepGraph,
  roots: Iterable<string>,
): Set<string> {
  const visited = new Set<string>();
  const queue = [...roots];

  while (queue.length > 0) {
    const current = queue.pop()!;
    const deps = graph.dependents.get(current) ?? [];
    for (const dep of deps) {
      if (!visited.has(dep)) {
        visited.add(dep);
        queue.push(dep);
      }
    }
  }

  return visited;
}

/** Extract workspace package names that use `workspace:*` protocol. */
function collectWorkspaceDeps(
  depsObject: Record<string, string> | undefined,
  packageNames: Set<string>,
): string[] {
  if (!depsObject || typeof depsObject !== "object") {
    return [];
  }

  const result: string[] = [];
  for (const [name, range] of Object.entries(depsObject)) {
    if (
      packageNames.has(name) &&
      typeof range === "string" &&
      range.startsWith("workspace:")
    ) {
      result.push(name);
    }
  }
  return result;
}
