import { Operation } from "npm:effection@3.6.0";
import { command } from "npm:zod-opts@0.1.8";
import { z } from "npm:zod@^3.20.2";
import type { AnalyzeFlags } from "../types.ts";
import { logger } from "../logger.ts";
import { discoverExtensions } from "../lib/discovery.ts";

export function* analyzeCommand(flags: AnalyzeFlags): Operation<void> {
  if (flags.verbose) {
    yield* logger.debug("Running analyze command with flags:", flags);
  }

  yield* logger.info("Analyzing extensions...");

  // Discover all extensions in the workspace
  const workspaceDir = Deno.cwd();
  const allExtensions = yield* discoverExtensions(workspaceDir);

  if (allExtensions.length === 0) {
    yield* logger.info("No extensions found in workspace");
    return;
  }

  // Filter extensions if specific extension requested
  const extensionsToAnalyze = flags.extName
    ? allExtensions.filter((ext) => ext.name === flags.extName)
    : allExtensions;

  if (flags.extName && extensionsToAnalyze.length === 0) {
    yield* logger.error(`Extension '${flags.extName}' not found`);
    return;
  }

  // Display analysis results
  yield* logger.info(
    `Found ${extensionsToAnalyze.length} extension(s) to analyze:`,
  );

  for (const extension of extensionsToAnalyze) {
    yield* logger.info(`\n📦 ${extension.name} (v${extension.version})`);
    yield* logger.info(`   Description: ${extension.config.description}`);
    yield* logger.info(`   Path: ${extension.path}`);
    yield* logger.info(
      `   Effection versions: ${extension.config.effection.join(", ")}`,
    );
    yield* logger.info(
      `   Registries: ${extension.config.registries.join(", ")}`,
    );
  }

  yield* logger.info(
    `\nAnalysis complete - discovered ${extensionsToAnalyze.length} extension(s)`,
  );
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
  });
