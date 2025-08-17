import { Operation } from "npm:effection@3.6.0";
import { command } from "npm:zod-opts@0.1.8";
import { z } from "npm:zod@^3.20.2";
import type {
  AnalyzeCommandArgs,
  ExtensionInput,
  VersionResolutionResult,
} from "../types.ts";
import { log } from "../logger.ts";
import {
  type DiscoveredExtension,
  discoverExtensions,
} from "../lib/discovery.ts";
import { resolveEffectionVersions } from "../lib/version-resolution.ts";

export function* analyzeCommand(
  flags: AnalyzeCommandArgs,
): Operation<DiscoveredExtension[]> {
  if (flags.verbose) {
    yield* log.debug("Running analyze command with flags:", flags);
  }

  yield* log.info("Analyzing extensions...");

  // Discover all extensions in the workspace
  const workspaceDir = flags.workspaceRoot;
  const allExtensions = yield* discoverExtensions(workspaceDir);

  if (allExtensions.length === 0) {
    yield* log.info("No extensions found in workspace");
    return [];
  }

  // Filter extensions if specific extension requested
  let extensionsToAnalyze = flags.extName
    ? allExtensions.filter((ext) => ext.name === flags.extName)
    : allExtensions;

  if (flags.extName && extensionsToAnalyze.length === 0) {
    yield* log.error(`Extension '${flags.extName}' not found`);
    return [];
  }

  // Resolve Effection versions for all extensions
  if (extensionsToAnalyze.length > 0) {
    yield* log.debug("Resolving Effection versions...");

    const extensionInputs: ExtensionInput[] = extensionsToAnalyze.map(
      (ext) => ({
        name: ext.name,
        config: { effection: ext.config.effection },
      }),
    );

    const resolutions = yield* resolveEffectionVersions(extensionInputs);

    // Transform resolutions and update extensions
    extensionsToAnalyze = extensionsToAnalyze.map((ext) => {
      const resolution = resolutions.find((r) => r.extensionName === ext.name);
      if (resolution) {
        const resolvedVersions: VersionResolutionResult[] = ext.config.effection
          .map((constraint) => {
            const resolvedVersion = resolution.resolvedVersions[constraint] ||
              null;
            const error = resolution.errors?.find((err) =>
              err.includes(`Failed to resolve ${constraint}:`)
            ) || null;
            return { constraint, resolvedVersion, error };
          });

        return { ...ext, resolvedVersions };
      }
      return ext;
    });
  }

  // Display analysis results
  yield* log.info(
    `Found ${extensionsToAnalyze.length} extension(s) to analyze:`,
  );

  for (const extension of extensionsToAnalyze) {
    yield* log.info(`\n📦 ${extension.name} (v${extension.version})`);
    yield* log.info(`   Description: ${extension.config.description}`);
    yield* log.info(`   Path: ${extension.path}`);
    yield* log.info(
      `   Effection versions: ${extension.config.effection.join(", ")}`,
    );

    // Display resolved versions
    if (extension.resolvedVersions.length > 0) {
      yield* log.info(`   Resolved versions:`);
      for (const resolution of extension.resolvedVersions) {
        if (resolution.error) {
          yield* log.info(
            `     ${resolution.constraint}: ❌ ${resolution.error}`,
          );
        } else {
          yield* log.info(
            `     ${resolution.constraint}: ✅ ${resolution.resolvedVersion}`,
          );
        }
      }
    }

    yield* log.info(
      `   Registries: ${extension.config.registries.join(", ")}`,
    );
  }

  yield* log.info(
    `\nAnalysis complete - discovered ${extensionsToAnalyze.length} extension(s)`,
  );

  return extensionsToAnalyze;
}

export const analyzeCommandDefinition = command("analyze")
  .description("Find extensions")
  .options({
    verbose: {
      type: z.boolean().default(false),
      alias: "v",
      description: "Print debugging output",
    },
    extName: {
      type: z.string().optional(),
      description: "Select extension to analyze",
    },
    workspaceRoot: {
      type: z.string().optional(),
      description: "Root directory of the workspace to search for extensions",
    },
  });
