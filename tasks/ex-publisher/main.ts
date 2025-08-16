#!/usr/bin/env -S deno run --allow-all
import { main, Operation } from "npm:effection@3.6.0";
import { parser } from "npm:zod-opts@0.1.8";
import {
  analyzeCommand,
  analyzeCommandDefinition,
} from "./commands/analyze.ts";
import { verifyCommand, verifyCommandDefinition } from "./commands/verify.ts";
import { planCommand, planCommandDefinition } from "./commands/plan.ts";
import {
  publishCommand,
  publishCommandDefinition,
} from "./commands/publish.ts";
import { loggerApi } from "./logger.ts";

function* cli(): Operation<void> {
  let commandToRun: Operation<void> | undefined;
  let verbose = false;

  parser()
    .subcommand(analyzeCommandDefinition
      .action((parsed) => {
        verbose = parsed.verbose;
        commandToRun = analyzeCommand(parsed);
      }))
    .subcommand(verifyCommandDefinition
      .action((parsed) => {
        verbose = parsed.verbose;
        commandToRun = verifyCommand(parsed);
      }))
    .subcommand(planCommandDefinition
      .action((parsed) => {
        verbose = parsed.verbose;
        commandToRun = planCommand(parsed);
      }))
    .subcommand(publishCommandDefinition
      .action((parsed) => {
        verbose = parsed.verbose;
        commandToRun = publishCommand(parsed);
      }))
    .parse();

    yield* loggerApi.around({
      *info(args, next) {
        yield* next(...args);
      },
      *warn(args, next) {
        if (verbose) {
          yield* next(...args);
        }
      },
      *debug(args, next) {
        if (verbose) {
          yield* next(...args);
        }
      },
      *error(args, next) {
        yield* next(...args);
      },
    })

  if (commandToRun) {
    yield* commandToRun;
  }
}

if (import.meta.main) {
  await main(cli);
}
