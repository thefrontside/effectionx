import { promises as fsp } from "node:fs";
import { resolve } from "node:path";
import process from "node:process";
import { x } from "@effectionx/tinyexec";
import { call, main } from "effection";
import { inc as semverInc } from "semver";
import {
  type WorkspacePackage,
  buildDepGraph,
  getTransitiveDependents,
} from "./lib/dep-graph.ts";

const mode = process.argv[2] ?? "check";

if (!["check", "sync"].includes(mode)) {
  console.error("Usage: node .internal/check-versions.ts [check|sync]");
  process.exit(1);
}

const isSyncMode = mode === "sync";

await main(function* () {
  const graph = yield* buildDepGraph();

  // Determine which packages have a version not yet published to npm.
  const pendingRelease = new Set<string>();

  for (const pkg of graph.packages.values()) {
    const npmCheck = yield* x(
      "npm",
      ["view", `${pkg.name}@${pkg.version}`, "version"],
      { throwOnError: false },
    );
    const result = yield* npmCheck;

    if (result.exitCode !== 0 || result.stdout.trim() === "") {
      pendingRelease.add(pkg.name);
    }
  }

  if (pendingRelease.size === 0) {
    console.log(
      "All package versions are already published. Nothing to check.",
    );
    return;
  }

  console.log(
    `Pending releases: ${[...pendingRelease]
      .map((name) => {
        const pkg = graph.packages.get(name)!;
        return `${name}@${pkg.version}`;
      })
      .join(", ")}`,
  );

  // Find all transitive dependents of the pending releases.
  const requiredBumps = getTransitiveDependents(graph, pendingRelease);

  // Remove packages that are already pending release — they're fine.
  for (const name of pendingRelease) {
    requiredBumps.delete(name);
  }

  if (requiredBumps.size === 0) {
    console.log("All cascade version bumps are in order.");
    return;
  }

  if (isSyncMode) {
    // Apply patch bumps to all packages that need them.
    const bumped: Array<{ name: string; from: string; to: string }> = [];

    for (const name of requiredBumps) {
      const pkg = graph.packages.get(name)!;
      const newVersion = semverInc(pkg.version, "patch");
      if (!newVersion) {
        console.error(`Failed to increment version for ${name}@${pkg.version}`);
        process.exit(1);
      }

      const packageJsonPath = resolve(pkg.workspacePath, "package.json");
      const raw = yield* call(() => fsp.readFile(packageJsonPath, "utf-8"));
      const json = JSON.parse(raw) as Record<string, unknown>;
      json.version = newVersion;
      yield* call(() =>
        fsp.writeFile(packageJsonPath, `${JSON.stringify(json, null, 2)}\n`),
      );

      bumped.push({ name, from: pkg.version, to: newVersion });
    }

    console.log("\nBumped cascade versions:");
    for (const { name, from, to } of bumped) {
      console.log(`  ${name} ${from} → ${to}`);
    }
  } else {
    // Check mode: report missing bumps and fail.
    console.error("\nMissing cascade version bumps:\n");

    // Group by the dependency that triggered the cascade.
    for (const name of requiredBumps) {
      const pkg = graph.packages.get(name)!;
      // Find which of its deps triggered this.
      const triggers = pkg.publishedWorkspaceDeps.filter((dep) =>
        pendingRelease.has(dep),
      );
      const triggerStr = triggers
        .map((t) => {
          const tp = graph.packages.get(t)!;
          return `${t}@${tp.version}`;
        })
        .join(", ");

      console.error(`  ${name} (${pkg.version}) — depends on ${triggerStr}`);
    }

    console.error("\nRun `pnpm versions:sync` to fix automatically.\n");
    process.exit(1);
  }
});
