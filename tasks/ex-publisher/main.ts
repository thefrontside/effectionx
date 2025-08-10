#!/usr/bin/env -S deno run --allow-all
import { main, Operation } from 'effection';
import { parseArgs } from 'jsr:@std/cli/parse-args';
import { analyzeCommand } from './commands/analyze.ts';
import { verifyCommand } from './commands/verify.ts';
import { planCommand } from './commands/plan.ts';
import { publishCommand } from './commands/publish.ts';
import type { GlobalFlags } from './types.ts';

function* cli(): Operation<void> {
  const args = parseArgs(Deno.args, {
    boolean: ['verbose', 'deno', 'node', 'jsr', 'npm', 'lint'],
    string: ['effection'],
    alias: {
      v: 'verbose',
    },
  });

  const globalFlags: GlobalFlags = {
    verbose: args.verbose,
  };

  const [command, extName] = args._;
  
  if (globalFlags.verbose) {
    console.log('Arguments:', args);
    console.log('Command:', command);
    console.log('Extension name:', extName);
  }

  switch (command) {
    case 'analyze': {
      yield* analyzeCommand({
        ...globalFlags,
        extName: extName as string,
      });
      break;
    }
    
    case 'verify': {
      yield* verifyCommand({
        ...globalFlags,
        extName: extName as string,
        deno: args.deno,
        node: args.node,
        effection: args.effection,
        lint: args.lint,
      });
      break;
    }
    
    case 'plan': {
      yield* planCommand({
        ...globalFlags,
        extName: extName as string,
        jsr: args.jsr,
        npm: args.npm,
        effection: args.effection,
      });
      break;
    }
    
    case 'publish': {
      yield* publishCommand({
        ...globalFlags,
        extName: extName as string,
        jsr: args.jsr,
        npm: args.npm,
        effection: args.effection,
      });
      break;
    }
    
    default: {
      console.log('Usage: ex-publisher <command> [options]');
      console.log('');
      console.log('Commands:');
      console.log('  analyze [ext_name]                 Analyze extensions');
      console.log('  verify [ext_name] [flags]          Run tests for extensions');
      console.log('  plan [ext_name] [flags]            Show publication plan');
      console.log('  publish [ext_name] [flags]         Publish extensions');
      console.log('');
      console.log('Global flags:');
      console.log('  --verbose, -v                      Print debugging output');
      console.log('');
      console.log('Verify flags:');
      console.log('  --deno                             Run Deno tests');
      console.log('  --node                             Run Node tests');
      console.log('  --effection=version                Test with specific Effection version');
      console.log('  --lint                             Run linting');
      console.log('');
      console.log('Plan/Publish flags:');
      console.log('  --jsr                              Target JSR registry');
      console.log('  --npm                              Target NPM registry');
      console.log('  --effection=version                Target specific Effection version');
      break;
    }
  }
}

if (import.meta.main) {
  await main(cli);
}