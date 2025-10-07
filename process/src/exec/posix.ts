import { spawn as spawnProcess } from "node:child_process";
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
import process from "node:process";
import { once } from "../eventemitter.ts";
import { useReadable } from "../helpers.ts";
import type { CreateOSProcess, ExitStatus, Writable } from "./api.ts";
import { ExecError } from "./error.ts";

type ProcessResultValue = [number?, string?];

export const createPosixProcess: CreateOSProcess = function* createPosixProcess(
  command,
  options,
) {
  let processResult = withResolvers<Result<ProcessResultValue>>();

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
  let childProcess = spawnProcess(command, options.arguments || [], {
    detached: true,
    shell: options.shell,
    env: options.env,
    cwd: options.cwd,
    stdio: "pipe",
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

  let stdout = createSignal<Uint8Array, void>();
  let stderr = createSignal<Uint8Array, void>();

  yield* spawn(function* () {
    yield* once(childProcess.stdout, "readable");
    io.stdoutReady.resolve();
    let next = yield* io.stdout.next();
    while (!next.done) {
      stdout.send(next.value);
      next = yield* io.stdout.next();
    }
    stdout.close();
    io.stdoutDone.resolve();
  });

  yield* spawn(function* () {
    yield* once(childProcess.stderr, "readable");
    io.stderrReady.resolve();
    let next = yield* io.stderr.next();
    while (!next.done) {
      stderr.send(next.value);
      next = yield* io.stderr.next();
    }
    stderr.close();
    io.stderrDone.resolve();
  });

  yield* spawn(function* trapError() {
    let [error] = yield* once<[Error]>(childProcess, "error");
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
        process.kill(-childProcess.pid, "SIGTERM");
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
