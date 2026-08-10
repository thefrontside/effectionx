import type { ChildProcess } from "node:child_process";
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
  race,
  spawn,
  withResolvers,
} from "effection";
import type {
  CreateOSProcess,
  ExecOptions,
  ExitStatus,
  Process,
  ShutdownMode,
  Writable,
} from "./types.ts";
import { Stdio } from "../api.ts";
import { ExecError } from "./error.ts";
import { unbox, useEvalScope } from "@effectionx/scope-eval";
import { settled } from "./shutdown.ts";

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
  let exitResult = withResolvers<Result<ProcessResultValue>>();
  let processResult = withResolvers<Result<ProcessResultValue>>();
  const evalScope = yield* useEvalScope();
  const result = yield* evalScope.eval(function* () {
    let stdoutDone = withResolvers<void>();
    let stderrDone = withResolvers<void>();
    let rawClose = withResolvers<Result<ProcessResultValue>>();

    let childProcess: ChildProcess | undefined;
    let teardownStarted = false;

    const shutdown = options.shutdown ?? "graceful";

    let hardTerminationRequested = false;
    const hardTerminationRequest = withResolvers<void>();

    function requestHardTermination(): void {
      if (!hardTerminationRequested) {
        hardTerminationRequested = true;
        hardTerminationRequest.resolve();
      }
    }

    const exit: Operation<ExitStatus> = {
      *[Symbol.iterator]() {
        let result = yield* exitResult.operation;
        if (result.ok) {
          let [code, signal] = result.value;
          return { command, options, code, signal } as ExitStatus;
        }
        throw result.error;
      },
    };

    function* reaped(): Operation<void> {
      yield* rawClose.operation;
    }

    function* closed(): Operation<void> {
      yield* all([
        processResult.operation,
        stdoutDone.operation,
        stderrDone.operation,
      ]);
    }

    function* shutdownProcess(join: () => Operation<void>): Operation<void> {
      let child = childProcess;
      let pid = child?.pid;
      if (!child || typeof pid === "undefined") {
        return;
      }

      function* gracefulCompletion(): Operation<ShutdownMode> {
        yield* join();
        return "graceful";
      }

      const hardTerminationTask =
        shutdown !== "graceful"
          ? yield* spawn(function* () {
              yield* hardTerminationRequest.operation;
              yield* killTree(pid);
            })
          : undefined;

      if (shutdown === "forced") {
        requestHardTermination();
      } else {
        try {
          ctrlc(pid);
        } catch (_) {}

        let stdin = child.stdin;
        if (stdin) {
          if (stdin.writable) {
            try {
              stdin.write("Y\n");
            } catch (_error) {}
          }
          stdin.end();
        }

        if (typeof shutdown === "function") {
          let mode: ShutdownMode;
          try {
            mode = yield* race([gracefulCompletion(), shutdown({ exit })]);
          } catch (_error) {
            mode = "forced";
          }
          if (mode === "forced") {
            requestHardTermination();
          }
        }
      }

      if (hardTerminationTask) {
        if (hardTerminationRequested) {
          yield* hardTerminationTask;
        } else {
          yield* hardTerminationTask.halt();
        }
      }

      yield* settled(join());
    }

    // A halt can land on any suspension point between here and the primary
    // teardown at the end of this generator, discarding every instruction
    // after it. This guard registers while `childProcess` is still empty and
    // the spawn below follows in the same synchronous continuation, so at no
    // point does the process exist without an armed teardown. It joins on
    // process exit alone because the stdio pumps may never have been wired.
    yield* ensure(function* () {
      if (!teardownStarted) {
        yield* shutdownProcess(reaped);
      }
    });

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
    childProcess = child;

    // Node listeners instead of spawned effection watchers: exit observation
    // must arm in the same synchronous continuation as the spawn so that the
    // guard above can join on it no matter where a halt lands.
    child.once("error", (error) => {
      exitResult.resolve(Err(error));
      processResult.resolve(Err(error));
      rawClose.resolve(Err(error));
    });
    child.once("exit", (code, signal) => {
      exitResult.resolve(Ok([code ?? undefined, signal ?? undefined]));
    });
    child.once("close", (code, signal) => {
      rawClose.resolve(Ok([code ?? undefined, signal ?? undefined]));
    });

    // Suppress EPIPE errors on stdin - these occur on Windows when the child
    // process exits before we finish writing to it. This is expected during
    // cleanup when we're killing the process.
    child.stdin.on("error", (err: Error & { code?: string }) => {
      if (err.code !== "EPIPE") {
        throw err;
      }
    });

    let { pid } = child;

    if (!child.stdout || !child.stderr) {
      throw new Error("stdout and stderr must be available with stdio: pipe");
    }

    let io = {
      stdout: yield* fromReadable(child.stdout),
      stderr: yield* fromReadable(child.stderr),
    };

    const stdout = createSignal<Uint8Array, void>();
    const stderr = createSignal<Uint8Array, void>();

    yield* spawn(function* () {
      let next = yield* io.stdout.next();
      while (!next.done) {
        yield* Stdio.operations.stdout(next.value);
        stdout.send(next.value);
        next = yield* io.stdout.next();
      }
      stdout.close();
      stdoutDone.resolve();
    });

    yield* spawn(function* () {
      let next = yield* io.stderr.next();
      while (!next.done) {
        yield* Stdio.operations.stderr(next.value);
        stderr.send(next.value);
        next = yield* io.stderr.next();
      }
      stderr.close();
      stderrDone.resolve();
    });

    let stdin: Writable<string> = {
      send(data: string) {
        child.stdin.write(data);
      },
    };

    yield* spawn(function* () {
      let result = yield* rawClose.operation;
      if (result.ok) {
        // win32 is more sensitive to graceful shutdown timing than posix, so
        // it is worth waiting for stdout and stderr to close before resolving
        // the process result
        yield* all([stdoutDone.operation, stderrDone.operation]);
      }
      processResult.resolve(result);
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

    yield* ensure(function* () {
      teardownStarted = true;
      yield* shutdownProcess(closed);
    });

    return {
      pid: pid as number,
      *around(
        ...args: Parameters<typeof Stdio.around>
      ): ReturnType<typeof Stdio.around> {
        const result = yield* evalScope.eval(() => Stdio.around(...args));
        return unbox(result);
      },
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
