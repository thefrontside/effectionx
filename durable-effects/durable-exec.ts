/**
 * Durable exec — persistent, replay-safe subprocess execution.
 *
 * Uses `createDurableOperation` from @effectionx/durable-streams.
 * During live execution, the operation runs and persists a Yield event.
 * During replay, the stored result is returned without executing.
 */

import {
  type Json,
  type Workflow,
  createDurableOperation,
} from "@effectionx/durable-streams";
import { useScope } from "effection";
import { type DurableRuntime, DurableRuntimeCtx } from "./runtime.ts";

export interface ExecOptions {
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  throwOnError?: boolean;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Execute a shell command durably.
 *
 * Never re-executed on replay — logs are authoritative.
 *
 * **Security note**: `env` values are NOT persisted to the journal —
 * only the env key names are recorded (for divergence detection).
 * The `throwOnError` flag is captured in the description so replay
 * behavior matches the original execution.
 */
export function* durableExec(
  name: string,
  options: ExecOptions,
): Workflow<ExecResult> {
  const { command, cwd, env, timeout = 300_000, throwOnError = true } = options;

  return (yield createDurableOperation<Json>(
    {
      type: "exec",
      name,
      command: command as Json,
      ...(cwd ? { cwd } : {}),
      // Only record env key names — values may contain secrets
      ...(env ? { envKeys: Object.keys(env).sort() as Json } : {}),
      timeout,
      throwOnError,
    },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const output = yield* runtime.exec({ command, cwd, env, timeout });

      if (throwOnError && output.exitCode !== 0) {
        throw new Error(
          `Command failed with exit code ${output.exitCode}: ${command.join(" ")}\n${output.stderr}`,
        );
      }
      return output as unknown as Json;
    },
  )) as ExecResult;
}
