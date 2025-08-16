import { Operation } from 'npm:effection@3.6.0';
import { command } from 'npm:zod-opts@0.1.8';
import { z } from 'npm:zod@^3.20.2';
import type { PlanFlags } from '../types.ts';
import { logger } from '../logger.ts';

export function* planCommand(flags: PlanFlags): Operation<void> {
  if (flags.verbose) {
    yield* logger.debug('Running plan command with flags:', flags);
  }

  yield* logger.info('Planning publication...');
  
  if (flags.extName) {
    yield* logger.info(`Planning for extension: ${flags.extName}`);
  } else {
    yield* logger.info('Planning for all extensions');
  }

  if (flags.effection) {
    yield* logger.info(`Planning for Effection version: ${flags.effection}`);
  }

  let registries = [];
  if (flags.jsr) registries.push('JSR');
  if (flags.npm) registries.push('NPM');
  if (registries.length === 0) registries = ['JSR', 'NPM'];
  
  yield* logger.info(`Planning for registries: ${registries.join(', ')}`);

  // TODO: Implement planning logic
  // 1. Compare current versions with published versions
  // 2. Determine which extensions need publishing
  // 3. Calculate version bumps based on strategy
  // 4. Generate execution plan
  // 5. Display plan to user
  
  yield* logger.info('Planning complete');
}

export const planCommandDefinition = command("plan")
  .description("Show the plan for publishing new versions of extensions")
  .options({
    verbose: {
      type: z.boolean().default(false),
      alias: 'v',
      description: "Print debugging output",
    },
    extName: {
      type: z.string().optional(),
      description: "Select extension to plan",
    },
    jsr: {
      type: z.boolean().optional(),
      description: "Show plan for JSR",
    },
    npm: {
      type: z.boolean().optional(),
      description: "Show plan for NPM",
    },
    effection: {
      type: z.string().optional(),
      description: "Show plan for specified version of Effection",
    },
  });