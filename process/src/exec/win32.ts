import { platform } from "node:os";
import { once } from "@effectionx/node-events";
// @ts-types="npm:@types/cross-spawn@6.0.6"
import { spawn as spawnProcess } from "cross-spawn";
import { ctrlc } from "ctrlc-windows";
import {
  Err,
  Ok,
  type Result,
  all,
  createSignal,
  resource,
  spawn,
  withResolvers,
} from "effection";
import { useReadable } from "../helpers.ts";
import type { CreateOSProcess, ExitStatus, Writable } from "./api.ts";
import { ExecError } from "./error.ts";

type ProcessResultValue = [number?, string?];

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

export const createWin32Process: CreateOSProcess = (command, options) => {
  return resource(function* (provide) {
    let processResult = withResolvers<Result<ProcessResultValue>>();

    // Windows-specific process spawning with different options than POSIX
    let childProcess = spawnProcess(command, options.arguments || [], {
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

    let { pid } = childProcess;

    let io = {
      stdout: yield* useReadable(childProcess.stdout),
      stderr: yield* useReadable(childProcess.stderr),
      stdoutDone: withResolvers<void>(),
      stderrDone: withResolvers<void>(),
    };

    const stdout = createSignal<Uint8Array, void>();
    const stderr = createSignal<Uint8Array, void>();

    yield* spawn(function* () {
      let next = yield* io.stdout.next();
      while (!next.done) {
        stdout.send(next.value);
        next = yield* io.stdout.next();
      }
      stdout.close();
      io.stdoutDone.resolve();
    });

    yield* spawn(function* () {
      let next = yield* io.stderr.next();
      while (!next.done) {
        stderr.send(next.value);
        next = yield* io.stderr.next();
      }
      stderr.close();
      io.stderrDone.resolve();
    });

    let stdin: Writable<string> = {
      send(data: string) {
        childProcess.stdin.write(data);
      },
    };

    yield* spawn(function* trapError() {
      const [error] = yield* once<Error[]>(childProcess, "error");
      processResult.resolve(Err(error));
    });

    yield* spawn(function* () {
      let value = yield* once<ProcessResultValue>(childProcess, "close");
      yield* all([io.stdoutDone.operation, io.stderrDone.operation]);
      processResult.resolve(Ok(value));
    });

    function* join() {
      let result = yield* processResult.operation;
      if (result.ok) {
        let [code, signal] = result.value;
        return { command, options, code, signal } as ExitStatus;
      }
      throw result.error;
    }

    function* expect() {
      let status = yield* join();
      if (status.code !== 0) {
        throw new ExecError(status, command, options);
      }
      return status;
    }

    try {
      yield* provide({
        pid: pid as number,
        stdin,
        stdout,
        stderr,
        join,
        expect,
      });
    } finally {
      try {
        // Only try to kill the process if it hasn't exited yet
        if (
          childProcess.exitCode === null &&
          childProcess.signalCode === null
        ) {
          if (typeof childProcess.pid === "undefined") {
            // biome-ignore lint/correctness/noUnsafeFinally: Intentional error for missing PID
            throw new Error("no pid for childProcess");
          }

          let stdinStream = childProcess.stdin;

          // Try graceful shutdown with ctrlc
          try {
            ctrlc(childProcess.pid);
            if (stdinStream.writable) {
              try {
                // Terminate batch process (Y/N)
                stdinStream.write("Y\n");
              } catch (_err) {
                // not much we can do here
              }
            }
          } catch (_err) {
            // ctrlc might fail
          }

          // Close stdin to allow process to exit cleanly
          try {
            stdinStream.end();
          } catch (_err) {
            // stdin might already be closed
          }

          // If process still hasn't exited, escalate
          if (
            childProcess.exitCode === null &&
            childProcess.signalCode === null
          ) {
            // Try regular kill first
            try {
              childProcess.kill();
            } catch (_err) {
              // process might already be dead
            }

            // If still alive after kill, force-kill entire process tree
            // This is necessary for bash on Windows where ctrlc doesn't work
            // and child.kill() only kills the shell, leaving grandchildren alive
            if (
              childProcess.exitCode === null &&
              childProcess.signalCode === null
            ) {
              yield* killTree(childProcess.pid);
            }
          }

          // Wait for streams to finish
          yield* all([io.stdoutDone.operation, io.stderrDone.operation]);
        }
      } catch (_e) {
        // do nothing, process is probably already dead
      }
    }
  });
};

export const isWin32 = (): boolean => platform() === "win32";
