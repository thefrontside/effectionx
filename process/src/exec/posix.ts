import { spawn as spawnProcess } from "node:child_process";
import process from "node:process";
import type { Operation } from "effection";
import type { ExecOptions, Process } from "./types.ts";
import { type SpawnStrategy, createNativeProcess } from "./native.ts";

const posix: SpawnStrategy = {
  spawn(command: string, options: ExecOptions) {
    // Killing all child processes started by this command is surprisingly
    // tricky. If a process spawns another processes and we kill the parent,
    // then the child process is NOT automatically killed. Instead we're using
    // the `detached` option to force the child into its own process group,
    // which all of its children in turn will inherit. By sending the signal to
    // `-pid` rather than `pid`, we are sending it to the entire process group
    // instead. This will send the signal to all processes started by the child
    // process.
    //
    // More information here: https://unix.stackexchange.com/questions/14815/process-descendants
    return spawnProcess(command, options.arguments || [], {
      detached: true,
      shell: options.shell,
      env: options.env,
      cwd: options.cwd,
      stdio: "pipe",
    });
  },

  *shutdown(child, drained) {
    if (typeof child.pid !== "undefined") {
      try {
        process.kill(-child.pid, "SIGTERM");
      } catch (_error) {
        // the process group is already gone
      }
    }
    yield* drained();
  },
};

export function* createPosixProcess(
  command: string,
  options: ExecOptions,
): Operation<Process> {
  return yield* createNativeProcess(command, options, posix);
}
