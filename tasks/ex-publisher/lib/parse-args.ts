import { Operation, withResolvers } from "npm:effection@3.6.0";
import { parser } from "npm:zod-opts@0.1.8";
import { analyzeCommandDefinition } from "../commands/analyze.ts";
import { verifyCommandDefinition } from "../commands/verify.ts";
import { planCommandDefinition } from "../commands/plan.ts";
import { publishCommandDefinition } from "../commands/publish.ts";
import type { Commands } from "../types.ts";

export function* parseArgs(): Operation<Commands> {
  const resolvers = withResolvers<Commands>();

  parser()
    .subcommand(analyzeCommandDefinition
      .action((parsed) =>
        resolvers.resolve({
          command: "analyze",
          options: parsed,
        })
      ))
    .subcommand(verifyCommandDefinition
      .action((parsed) =>
        resolvers.resolve({
          command: "verify",
          options: parsed,
        })
      ))
    .subcommand(planCommandDefinition
      .action((parsed) =>
        resolvers.resolve({
          command: "plan",
          options: parsed,
        })
      ))
    .subcommand(publishCommandDefinition
      .action((parsed) =>
        resolvers.resolve({
          command: "publish",
          options: parsed,
        })
      ))
    .parse();

  return yield* resolvers.operation;
}
