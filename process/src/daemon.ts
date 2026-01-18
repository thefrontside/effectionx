import { type Operation, resource } from "effection";

import {
  DaemonExitError,
  exec,
  type ExecOptions,
  type ExitStatus,
  type Process,
} from "./exec.ts";

export interface Daemon extends Operation<void>, Process {}

/**
 * Start a long-running process, like a web server that run perpetually.
 * Daemon operations are expected to run forever, and if they exit pre-maturely
 * before the operation containing them passes out of scope it raises an error.
 */
export function daemon(
  command: string,
  options: ExecOptions = {},
): Operation<Daemon> {
  return resource(function* (provide) {
    // TODO: should we be able to terminate the process from here?
    let process = yield* exec(command, options);

    yield* provide({
      *[Symbol.iterator]() {
        let status: ExitStatus = yield* process.join();
        throw new DaemonExitError(status, command, options);
      },
      ...process,
    });
  });
}
