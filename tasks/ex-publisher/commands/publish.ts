import { Operation } from "npm:effection@3.6.0";
import { command } from "npm:zod-opts@0.1.8";
import { z } from "npm:zod@^3.20.2";
import type { PublishFlags } from "../types.ts";
import { logger } from "../logger.ts";

export function* publishCommand(flags: PublishFlags): Operation<void> {
  if (flags.verbose) {
    yield* logger.debug("Running publish command with flags:", flags);
  }

  yield* logger.info("Publishing extensions...");

  if (flags.extName) {
    yield* logger.info(`Publishing extension: ${flags.extName}`);
  } else {
    yield* logger.info("Publishing all extensions");
  }

  if (flags.effection) {
    yield* logger.info(`Publishing for Effection version: ${flags.effection}`);
  }

  let registries = [];
  if (flags.jsr) registries.push("JSR");
  if (flags.npm) registries.push("NPM");
  if (registries.length === 0) registries = ["JSR", "NPM"];

  yield* logger.info(`Publishing to registries: ${registries.join(", ")}`);

  // TODO: Implement publishing logic
  // 1. Execute the plan from plan command
  // 2. For each extension and version:
  //    - Generate appropriate package files
  //    - Run final verification
  //    - Publish to specified registries
  // 3. Handle partial failures with retry logic
  // 4. Store error state for roll-forward recovery

  yield* logger.info("Publishing complete");
}

export const publishCommandDefinition = command("publish")
  .description("Publish new versions of extensions")
  .options({
    verbose: {
      type: z.boolean().default(false),
      alias: "v",
      description: "Print debugging output",
    },
    extName: {
      type: z.string().optional(),
      description: "Select extension to publish",
    },
    jsr: {
      type: z.boolean().optional(),
      description: "Publish to JSR",
    },
    npm: {
      type: z.boolean().optional(),
      description: "Publish to NPM",
    },
    effection: {
      type: z.string().optional(),
      description: "Publish for specified version of Effection",
    },
  });
