import { platform } from "node:os";
import { createSignal, Err, Ok, race, type Result, spawn, withResolvers } from "effection";
import { spawn as spawnProcess } from "cross-spawn";
import { ctrlc } from "ctrlc-windows";
import { once } from "../eventemitter.ts";
import { box, useReadable } from "../helpers.ts";
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
    // When windows shell is true, it runs with cmd.exe by default, but
    // node has trouble with PATHEXT and exe. It can't run exe directly for example.
    // `cross-spawn` handles running it with the shell in windows if needed.
    // Neither mac nor linux need shell and we run it detached.
    shell: typeof options.shell === "string" ? options.shell : false,
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

  yield* spawn(function* trapError() {
    let [error] = yield* once<[Error]>(childProcess, "error");
    processResult.resolve(Err(error));
  });

  let result = yield* race([
    processResult.operation,
    box(() => once(childProcess, "spawn")),
  ]);
  if (!result.ok) {
    throw result.error;
  }

  const io = {
    stdout: yield* useReadable(childProcess.stdout),
    stderr: yield* useReadable(childProcess.stderr)
  }

  const stdout = createSignal<Uint8Array, void>();
  const stderr = createSignal<Uint8Array, void>();

  yield* spawn(function*() {
    let next = yield* io.stdout.next();
    while (!next.done) {
      stdout.send(next.value);
      next = yield* io.stdout.next(); 
    }
    stdout.close();
  });

  yield* spawn(function*() {
    let next = yield* io.stderr.next();
    while (!next.done) {
      stderr.send(next.value);
      next = yield* io.stderr.next(); 
    }
    stderr.close();
  });

  let stdin: Writable<string> = {
    send(data: string) {
      childProcess.stdin.write(data);
    },
  };

  yield* spawn(function* trapError() {
    let [error] = yield* once<[Error]>(childProcess, "error");
    processResult.resolve(Err(error));
  });

  yield* spawn(function* () {
    try {
      let value = yield* once<ProcessResultValue>(childProcess, "exit");
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
        stdinStream.end();
        if (childProcess.stdout) {
          yield* once(childProcess.stdout, "end");
        }
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
    let status: ExitStatus = yield* join();
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
