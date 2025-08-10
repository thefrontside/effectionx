#!/usr/bin/env -S deno run --allow-all
import { main, Operation } from 'npm:effection@3.6.0';
import { parser, command } from 'npm:zod-opts@0.1.8';
import { z } from 'npm:zod@^3.20.2';
import { analyzeCommand } from './commands/analyze.ts';
import { verifyCommand } from './commands/verify.ts';
import { planCommand } from './commands/plan.ts';
import { publishCommand } from './commands/publish.ts';

function* cli(): Operation<void> {
  let commandToRun: Operation<void> | undefined;

  const analyze = command("analyze")
    .options({
      verbose: {
        type: z.boolean().default(false),
        alias: 'v',
      },
      extName: {
        type: z.string().optional(),
      },
    })
    .action((parsed) => {
      commandToRun = analyzeCommand(parsed);
    });

  const verify = command("verify")
    .options({
      verbose: {
        type: z.boolean().default(false),
        alias: 'v',
      },
      extName: {
        type: z.string().optional(),
      },
      deno: {
        type: z.boolean().optional(),
      },
      node: {
        type: z.boolean().optional(),
      },
      effection: {
        type: z.string().optional(),
      },
      lint: {
        type: z.boolean().optional(),
      },
    })
    .action((parsed) => {
      commandToRun = verifyCommand(parsed);
    });

  const plan = command("plan")
    .options({
      verbose: {
        type: z.boolean().default(false),
        alias: 'v',
      },
      extName: {
        type: z.string().optional(),
      },
      jsr: {
        type: z.boolean().optional(),
      },
      npm: {
        type: z.boolean().optional(),
      },
      effection: {
        type: z.string().optional(),
      },
    })
    .action((parsed) => {
      commandToRun = planCommand(parsed);
    });

  const publish = command("publish")
    .options({
      verbose: {
        type: z.boolean().default(false),
        alias: 'v',
      },
      extName: {
        type: z.string().optional(),
      },
      jsr: {
        type: z.boolean().optional(),
      },
      npm: {
        type: z.boolean().optional(),
      },
      effection: {
        type: z.string().optional(),
      },
    })
    .action((parsed) => {
      commandToRun = publishCommand(parsed);
    });

  parser()
    .subcommand(analyze)
    .subcommand(verify)
    .subcommand(plan)
    .subcommand(publish)
    .parse();

  if (commandToRun) {
    yield* commandToRun;
  }
}

if (import.meta.main) {
  await main(cli);
}