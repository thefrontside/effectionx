import { platform } from "node:os";
import { once } from "@effectionx/node/events";
import { fromReadable } from "@effectionx/node/stream";
// @ts-types="npm:@types/cross-spawn@6.0.6"
import { spawn as spawnProcess } from "cross-spawn";
import { ctrlc } from "ctrlc-windows";
import {
  type Operation,
  type Result,
  type Yielded,
  Err,
  Ok,
  all,
  createSignal,
  ensure,
  spawn,
  withResolvers,
} from "effection";
import type {
  CreateOSProcess,
  ExecOptions,
  ExitStatus,
  Process,
  Writable,
} from "./types.ts";
import { stdioApi } from "../api.ts";
import { ExecError } from "./error.ts";
import { unbox, useEvalScope } from "@effectionx/scope-eval";

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

export function* createWin32Process(
  command: string,
  options: ExecOptions,
): Operation<Process> {
  let processResult = withResolvers<Result<ProcessResultValue>>();
  const evalScope = yield* useEvalScope();
  const result = yield* evalScope.eval(function* () {
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

    if (!childProcess.stdout || !childProcess.stderr) {
      throw new Error("stdout and stderr must be available with stdio: pipe");
    }

    let io = {
      stdout: yield* fromReadable(childProcess.stdout),
      stderr: yield* fromReadable(childProcess.stderr),
      stdoutDone: withResolvers<void>(),
      stderrDone: withResolvers<void>(),
    };

    const stdout = createSignal<Uint8Array, void>();
    const stderr = createSignal<Uint8Array, void>();

    yield* spawn(function* () {
      let next = yield* io.stdout.next();
      while (!next.done) {
        yield* stdioApi.operations.stdout(next.value);
        stdout.send(next.value);
        next = yield* io.stdout.next();
      }
      stdout.close();
      io.stdoutDone.resolve();
    });

    yield* spawn(function* () {
      let next = yield* io.stderr.next();
      while (!next.done) {
        yield* stdioApi.operations.stderr(next.value);
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

    // Suppress EPIPE errors on stdin - these occur on Windows when the child
    // process exits before we finish writing to it. This is expected during
    // cleanup when we're killing the process.
    childProcess.stdin.on("error", (err: Error & { code?: string }) => {
      if (err.code !== "EPIPE") {
        throw err;
      }
    });

    yield* ensure(function* () {
      // If no pid is available, we have no way to kill the process,
      //  so we skip and presume it is cleaned up.
      if (pid) {
        try {
          ctrlc(pid);
        } catch (_) {
          // if it throws, the process probably doesn't exist anymore
          //  as it does a process.kill(0) check which will throw if the process is not found
        }

        let stdin = childProcess.stdin;
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
      yield* all([io.stdoutDone.operation, io.stderrDone.operation]);

      if (pid && !childProcess.exitCode) {
        // If the process is still around after we've waited for stdout and stderr to close,
        // then force kill the tree.
        yield* killTree(pid);
      }
    });

    return {
      pid: pid as number,
      around: stdioApi.around,
      stdin,
      stdout,
      stderr,
      join,
      expect,
    } satisfies Yielded<ReturnType<CreateOSProcess>>;
  });
  return unbox(result);
}

export const isWin32 = (): boolean => platform() === "win32";
