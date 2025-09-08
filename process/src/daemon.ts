import { type Operation, resource, spawn } from "effection";

import {
  DaemonExitError,
  exec,
  type ExecOptions,
  type ExitStatus,
  type Process,
} from "./exec.ts";

/**
 * Start a long-running process, like a web server that run perpetually.
 * Daemon operations are expected to run forever, and if they exit pre-maturely
 * before the operation containing them passes out of scope it raises an error.
 */
export function daemon(
  command: string,
  options: ExecOptions = {},
): Operation<Process> {
  return resource(function* (provide) {
    let process = yield* exec(command, options);

    const task = yield* spawn(function* failOnExit() {
      let status: ExitStatus = yield* process.join();
      throw new DaemonExitError(status, command, options);
    });

    try {
      yield* provide(process);
    } finally {
      task.halt();
    }
  });
}
