#!/usr/bin/env -S deno run --allow-all
import { main, Operation } from "npm:effection@3.6.0";
import { analyze } from "./commands/analyze.ts";
import type { AnalyzeFlags, Commands } from "./types.ts";
import { verify } from "./commands/verify.ts";
import { plan } from "./commands/plan.ts";
import { publish } from "./commands/publish.ts";
import { verboseLogging } from "./logger.ts";
import { parseArgs } from "./lib/parse-args.ts";

function* cli(): Operation<void> {
  const command = yield* parseArgs();

  yield* verboseLogging(command.options.verbose ?? false);

  let lastStageResult: unknown;
  for (
    const stage of [
      "analyze",
      "verify",
      "plan",
      "publish",
    ] as Commands["command"][]
  ) {
    switch (stage) {
      case "analyze":
        lastStageResult = yield* analyze({
          ...command.options,
          workspaceRoot: (command.options as AnalyzeFlags).workspaceRoot ??
            Deno.cwd(),
        });
        break;
      case "verify":
        lastStageResult = yield* verify(command.options);
        break;
      case "plan":
        lastStageResult = yield* plan(command.options);
        break;
      case "publish":
        lastStageResult = yield* publish(command.options);
        break;
    }
    if (stage === command.command) {
      break;
    }
  }
}

if (import.meta.main) {
  await main(cli);
}
