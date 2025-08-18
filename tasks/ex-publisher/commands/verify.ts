import { call, Operation } from "npm:effection@3.6.0";
import { command } from "npm:zod-opts@0.1.8";
import { z } from "npm:zod@^3.20.2";
import type { VerifyFlags } from "../types.ts";
import { log, namespace } from "../logger.ts";

export function* verify(flags: VerifyFlags): Operation<void> {
  return yield* call(function* () {
    yield* namespace("verify");
    return yield* verifyCommand(flags);
  });
}

export function* verifyCommand(flags: VerifyFlags): Operation<void> {
  if (flags.verbose) {
    yield* log.debug("Running verify command with flags:", flags);
  }

  yield* log.info("Verifying extensions...");

  if (flags.extName) {
    yield* log.info(`Verifying extension: ${flags.extName}`);
  } else {
    yield* log.info("Verifying all extensions");
  }

  if (flags.effection) {
    yield* log.info(`Testing with Effection version: ${flags.effection}`);
  }

  if (flags.deno) {
    yield* log.info("Running Deno tests...");
    // TODO: Execute Deno tests with import map
  }

  if (flags.node) {
    yield* log.info("Running Node tests...");
    // TODO: Generate Node package with DNT and run tests
  }

  if (flags.lint) {
    yield* log.info("Running linting...");
    // TODO: Execute linting
  }

  // TODO: Implement test execution
  // 1. Set up import maps for specific Effection versions
  // 2. Execute Deno tests
  // 3. Generate Node packages with DNT
  // 4. Execute Node tests
  // 5. Run linting if requested

  yield* log.info("Verification complete");
}

export const verifyCommandDefinition = command("verify")
  .description("Run tests for extensions")
  .options({
    verbose: {
      type: z.boolean().default(false),
      alias: "v",
      description: "Print debugging output",
    },
    extName: {
      type: z.string().optional(),
      description: "Select extension to run tests for",
    },
    deno: {
      type: z.boolean().optional(),
      description: "Run tests for deno",
    },
    node: {
      type: z.boolean().optional(),
      description: "Run tests for node",
    },
    effection: {
      type: z.string().optional(),
      description: "Run tests for specified version of Effection",
    },
    lint: {
      type: z.boolean().optional(),
      description: "Run lint as part of verify",
    },
  });
