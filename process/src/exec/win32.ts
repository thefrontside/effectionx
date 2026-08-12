import { platform } from "node:os";
import { once } from "@effectionx/node/events";
// @ts-types="npm:@types/cross-spawn@6.0.6"
import { spawn as spawnProcess } from "cross-spawn";
import { ctrlc } from "ctrlc-windows";
import type { Operation } from "effection";
import type { ExecOptions, Process } from "./types.ts";
import { type SpawnStrategy, createNativeProcess } from "./native.ts";

function* killTree(pid: number) {
  try {
    const killer = spawnProcess(
      "cmd.exe",
      ["/c", "taskkill", "/PID", String(pid), "/T", "/F"],
      { windowsHide: true, stdio: "ignore" },
    );
    yield* once(killer, "close");
  } catch (_) {
    // best-effort; ignore errors
  }
}

const win32: SpawnStrategy = {
  spawn(command: string, options: ExecOptions) {
    // Windows-specific process spawning with different options than POSIX
    const child = spawnProcess(command, options.arguments || [], {
      // We lose exit information and events if this is detached in windows
      // and it opens a window in windows+powershell.
      detached: false,
      // The `shell` option is passed to `cross-spawn` to control whether a shell is used.
      // On Windows, `shell: true` is necessary to run command strings, as it uses
      // `cmd.exe` to parse the command and find executables in the PATH.
      // Using a boolean `true` was previously disabled, causing ENOENT errors for
      // commands that were not a direct path to an executable.
      shell: options.shell || false,
      // With stdio as pipe, windows gets stuck where neither the child nor the
      // parent wants to close the stream, so we call it ourselves in the exit event.
      stdio: "pipe",
      // Hide the child window so that killing it will not block the parent
      // with a Terminate Batch Process (Y/n)
      windowsHide: true,
      env: options.env,
      cwd: options.cwd,
    });

    // Suppress EPIPE errors on stdin - these occur on Windows when the child
    // process exits before we finish writing to it. This is expected during
    // cleanup when we're killing the process.
    child.stdin?.on("error", (err: Error & { code?: string }) => {
      if (err.code !== "EPIPE") {
        throw err;
      }
    });

    return child;
  },

  *shutdown(child, drained) {
    // If no pid is available, we have no way to kill the process,
    //  so we skip and presume it is cleaned up.
    const pid = child.pid;
    if (pid) {
      try {
        ctrlc(pid);
      } catch (_) {
        // if it throws, the process probably doesn't exist anymore
        //  as it does a process.kill(0) check which will throw if the process is not found
      }

      const stdin = child.stdin;
      if (stdin) {
        if (stdin.writable) {
          try {
            //Terminate batch process (Y/N)
            stdin.write("Y\n");
          } catch (_err) {
            /* not much we can do here */
          }
        }
        stdin.end();
      }
    }

    // depending on how we shutdown, this may already be closed and
    // will pass immediately over the operations
    yield* drained();

    if (pid && child.exitCode === null) {
      // If the process is still around after we've waited
      // for stdout and stderr to close,
      // then force kill the tree.
      yield* killTree(pid);
    }
  },
};

export function* createWin32Process(
  command: string,
  options: ExecOptions,
): Operation<Process> {
  return yield* createNativeProcess(command, options, win32);
}

export const isWin32 = (): boolean => platform() === "win32";
