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

function* cli(): Operation<void> {
  let commandToRun: Operation<void> | undefined;

  parser()
    .subcommand(analyzeCommandDefinition
      .action((parsed) => {
        commandToRun = analyzeCommand(parsed);
      }))
    .subcommand(verifyCommandDefinition
      .action((parsed) => {
        commandToRun = verifyCommand(parsed);
      }))
    .subcommand(planCommandDefinition
      .action((parsed) => {
        commandToRun = planCommand(parsed);
      }))
    .subcommand(publishCommandDefinition
      .action((parsed) => {
        commandToRun = publishCommand(parsed);
      }))
    .parse();

  if (commandToRun) {
    yield* commandToRun;
  }
}

if (import.meta.main) {
  await main(cli);
}
