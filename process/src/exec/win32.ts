import { platform } from "node:os";
import {
  all,
  createSignal,
  Err,
  Ok,
  race,
  type Result,
  sleep,
  spawn,
  withResolvers,
} from "effection";
// @ts-types="npm:@types/cross-spawn"
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

  console.log(`win32 > ${pid}`);

  childProcess.stdout.on(
    "data",
    (d) => console.log(`win32 > ${pid} > stdout: ${d}`),
  );
  childProcess.stderr.on(
    "data",
    (d) => console.log(`win32 > ${pid} > stderr: ${d}`),
  );


  let io = {
    stdout: yield* useReadable(childProcess.stdout),
    stderr: yield* useReadable(childProcess.stderr),
    stdoutReady: withResolvers<void>(),
    stdoutDone: withResolvers<void>(),
    stderrReady: withResolvers<void>(),
    stderrDone: withResolvers<void>(),
  };

  yield* spawn(function* trapError() {
    console.log(`win32 > ${pid} > trapError waiting for error`);
    let [error] = yield* once<[Error]>(childProcess, "error");
    console.log(`win32 > ${pid} > trapError: ${error.message}`);
    processResult.resolve(Err(error));
  });

  let result = yield* race([
    processResult.operation,
    box(function* () {
      console.log(`win32 > ${pid} > waiting for spawn`);
      yield* once(childProcess, "spawn");
      console.log(`win32 > ${pid} > spawned`);
    }),
  ]);

  console.log(`win32 > ${pid} > after result`);
  console.dir(result, { depth: 10 });

  if (!result.ok) {
    console.log(`win32 > ${pid} > failed to start: ${result.error.message}`);
    throw result.error;
  }

  yield* spawn(function* () {
    yield* once(childProcess.stdout, "readable");
    console.log(`win32 > ${pid} > stdout is readable`);
    io.stdoutReady.resolve();
  });

  yield* spawn(function* () {
    yield* once(childProcess.stderr, "readable");
    console.log(`win32 > ${pid} > stderr is readable`);
    io.stderrReady.resolve();
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

  let stdin: Writable<string> = {
    send(data: string) {
      childProcess.stdin.write(data);
    },
  };

  yield* spawn(function* () {
    try {
      let value = yield* once<ProcessResultValue>(childProcess, "exit");
      console.log(`win32 > ${pid} > complete: ${JSON.stringify(value)}`);
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
        stdinStream.end();
        // console.log(`win32 > ${pid} > before waiting for close`);
        // yield* all([io.stdoutDone.operation, io.stderrDone.operation]);
        // console.log(`win32 > ${pid} > after waiting for close`);
      } catch (_e) {
        // do nothing, process is probably already dead
      }
    }
  });

  function* join() {
    let result = yield* processResult.operation;
    console.log(`win32 > ${pid} > join: start`);
    console.log(result);
    console.log(`win32 > ${pid} > join: end`);
    if (result.ok) {
      let [code, signal] = result.value;
      return { command, options, code, signal } as ExitStatus;
    } else {
      console.log(`win32 > ${pid} > join: throwing ${result.error.message}`);
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
