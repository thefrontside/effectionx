#!/usr/bin/env -S deno run --allow-all
import { call, main, Operation, withResolvers } from "npm:effection@3.6.0";
import { parser } from "npm:zod-opts@0.1.8";
import {
  analyzeCommand,
  analyzeCommandDefinition,
} from "./commands/analyze.ts";
import type { AnalyzeFlags, VerifyFlags, PlanFlags, PublishFlags } from "./types.ts";
import { verifyCommand, verifyCommandDefinition } from "./commands/verify.ts";
import { planCommand, planCommandDefinition } from "./commands/plan.ts";
import {
  publishCommand,
  publishCommandDefinition,
} from "./commands/publish.ts";
import { namespace, setupVerboseLogging } from "./logger.ts";

type Commands = {
  command: "analyze",
  options: AnalyzeFlags
} | {
  command: "verify",
  options: VerifyFlags
} | {
  command: "plan",
  options: PlanFlags
} | {
  command: "publish",
  options: PublishFlags
}

function* cli(): Operation<void> {
  const resolvers = withResolvers<Commands>();

  parser()
    .subcommand(analyzeCommandDefinition
      .action((parsed) => resolvers.resolve({
        command: "analyze",
        options: parsed,
      }))
    )
    .subcommand(verifyCommandDefinition
      .action((parsed) => resolvers.resolve({
        command: "verify",
        options: parsed,
      }))
    )
    .subcommand(planCommandDefinition
      .action((parsed) => resolvers.resolve({
        command: "plan",
        options: parsed,
      }))
    )
    .subcommand(publishCommandDefinition
      .action((parsed) => resolvers.resolve({
        command: "publish",
        options: parsed,
      }))
    )
    .parse();

  const command = yield* resolvers.operation

  yield* setupVerboseLogging(command.options.verbose ?? false);

  switch (command.command) {
    case "analyze":
      yield* call(function* () {
        yield* namespace("analyze");
        yield* analyzeCommand({
          ...command.options,
          workspaceRoot: command.options.workspaceRoot || Deno.cwd(),
        });
      });
      break;
    case "verify":
      yield* call(function* () {
        yield* namespace("verify");
        yield* verifyCommand(command.options);
      });
      break;
    case "plan":
      yield* call(function* () {
        yield* namespace("plan");
        yield* planCommand(command.options);
      });
      break;
    case "publish":
      yield* call(function* () {
        yield* namespace("publish");
        yield* publishCommand(command.options);
      });
      break;
  }
}

if (import.meta.main) {
  await main(cli);
}
