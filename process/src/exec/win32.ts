import { platform } from "node:os";
import {
  all,
  createSignal,
  Err,
  Ok,
  type Result,
  sleep,
  spawn,
  withResolvers,
} from "effection";
// @ts-types="npm:@types/cross-spawn"
import { spawn as spawnProcess } from "cross-spawn";
import { ctrlc } from "ctrlc-windows";
import { once } from "../eventemitter.ts";
import { useReadable } from "../helpers.ts";
import type { CreateOSProcess, ExitStatus, Writable } from "./api.ts";
import { ExecError } from "./error.ts";

type ProcessResultValue = [number?, string?];

export const createWin32Process: CreateOSProcess = function* createWin32Process(
  command,
  options,
) {
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
    stdoutReady: withResolvers<void>(),
    stdoutDone: withResolvers<void>(),
    stderrReady: withResolvers<void>(),
    stderrDone: withResolvers<void>(),
  };

  yield* spawn(function* () {
    yield* once(childProcess.stdout, "readable");
    io.stdoutReady.resolve();
    yield* once(childProcess.stdout, "end");
    io.stdoutDone.resolve();
  });

  yield* spawn(function* () {
    yield* once(childProcess.stderr, "readable");
    io.stderrReady.resolve();
    yield* once(childProcess.stderr, "end");
    io.stderrDone.resolve();
  });

  const stdout = createSignal<Uint8Array, void>();
  const stderr = createSignal<Uint8Array, void>();

  yield* spawn(function* () {
    let next = yield* io.stdout.next();
    while (!next.done) {
      stdout.send(next.value);
      next = yield* io.stdout.next();
    }
    stdout.close();
  });

  yield* spawn(function* () {
    let next = yield* io.stderr.next();
    while (!next.done) {
      stderr.send(next.value);
      next = yield* io.stderr.next();
    }
    stderr.close();
  });

  yield* spawn(function* trapError() {
    const [error] = yield* once<Error[]>(childProcess, "error");
    processResult.resolve(Err(error));
  });

  let stdin: Writable<string> = {
    send(data: string) {
      childProcess.stdin.write(data);
    },
  };

  yield* spawn(function* () {
    try {
      let value = yield* once<ProcessResultValue>(childProcess, "close");
      yield* all([
        io.stdoutReady.operation,
        io.stderrReady.operation,
        sleep(1),
      ]);
      processResult.resolve(Ok(value));
    } finally {
      try {
        if (typeof childProcess.pid === "undefined") {
          // deno-lint-ignore no-unsafe-finally
          throw new Error("no pid for childProcess");
        }
        // Windows-specific cleanup using ctrlc
        ctrlc(childProcess.pid);
        let stdinStream = childProcess.stdin;
        if (stdinStream.writable) {
          try {
            // Terminate batch process (Y/N)
            stdinStream.write("Y\n");
          } catch (_err) {
            // not much we can do here
          }
        }
        yield* all([io.stdoutDone.operation, io.stderrDone.operation]);
      } catch (_e) {
        // do nothing, process is probably already dead
      }
    }
  });

  function* join() {
    let result = yield* processResult.operation;
    if (result.ok) {
      let [code, signal] = result.value;
      return { command, options, code, signal } as ExitStatus;
    } else {
      throw result.error;
    }
  }

  function* expect() {
    let status = yield* join();
    if (status.code != 0) {
      throw new ExecError(status, command, options);
    } else {
      return status;
    }
  }

  // FYI: this function starts a process and returns without blocking
  return {
    pid: pid as number,
    stdin,
    stdout,
    stderr,
    join,
    expect,
  };
};

export const isWin32 = (): boolean => platform() === "win32";
