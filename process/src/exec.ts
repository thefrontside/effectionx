import { split } from "shellwords";

import { type Operation, spawn } from "effection";
import type {
  CreateOSProcess,
  ExecOptions,
  ExitStatus,
  Process,
  ProcessResult,
} from "./exec/api.ts";
import { createPosixProcess } from "./exec/posix.ts";
import { createWin32Process, isWin32 } from "./exec/win32.ts";
import { forEach } from "./for-each.ts";

export * from "./exec/api.ts";
export * from "./exec/error.ts";

export interface Exec extends Operation<Process> {
  join(): Operation<ProcessResult>;
  expect(): Operation<ProcessResult>;
}

const createProcess: CreateOSProcess = (cmd, opts) => {
  if (isWin32()) {
    return createWin32Process(cmd, opts);
  } else {
    return createPosixProcess(cmd, opts);
  }
};

/**
 * Execute `command` with `options`. You should use this operation for processes
 * that have a finite lifetime and on which you may wish to synchronize on the
 * exit status. If you want to start a process like a server that spins up and runs
 * forever, consider using `daemon()`
 */
export function exec(command: string, options: ExecOptions = {}): Exec {
  let [cmd, ...args] = options.shell ? [command] : split(command);
  let opts = { ...options, arguments: args.concat(options.arguments || []) };

  return {
    *[Symbol.iterator]() {
      return yield* createProcess(cmd, opts);
    },
    *join() {
      const process = yield* createProcess(cmd, opts);

      let stdout = "";
      let stderr = "";

      yield* spawn(forEach(function* (chunk) { stdout += chunk; }, process.stdout));
      yield* spawn(forEach(function* (chunk) { stderr += chunk; }, process.stderr));

      let status: ExitStatus = yield* process.join();

      return { ...status, stdout, stderr };
    },
    *expect() {
      const process = yield* createProcess(cmd, opts);

      let stdout = "";
      let stderr = "";

      yield* spawn(forEach(function* (chunk) { stdout += chunk; }, process.stdout));
      yield* spawn(forEach(function* (chunk) { stderr += chunk; }, process.stderr));

      let status: ExitStatus = yield* process.expect();

      return { ...status, stdout, stderr };
    },
  };
}
