import { spawn as spawnProcess } from "node:child_process";
import {
  createSignal,
  Err,
  Ok,
  race,
  type Result,
  sleep,
  spawn,
  withResolvers,
} from "effection";
import process from "node:process";
import { once } from "../eventemitter.ts";
import { box, useReadable } from "../helpers.ts";
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

  yield* spawn(function* trapError() {
    let [error] = yield* once<[Error]>(childProcess, "error");
    console.log(`posix>error: ${error}`)
    processResult.resolve(Err(error));
  });

  let result = yield* race([
    processResult.operation,
    box(() => once(childProcess, "spawn")),
  ]);
  if (!result.ok) {
    throw result.error;
  }

  childProcess.stdout.on("data", (d) => console.log(`posix > ${pid} > stdout > on('data'): ${d}`));
  childProcess.stdout.on("data", (d) => console.log(`posix > ${pid} > stderr > on('data'): ${d}`));

  let io = {
    stdout: yield* useReadable(childProcess.stdout),
    stderr: yield* useReadable(childProcess.stderr),
  };

  let stdout = createSignal<Uint8Array, void>();
  let stderr = createSignal<Uint8Array, void>();

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
      yield* sleep(1);
      processResult.resolve(Ok(value));
    } finally {
      try {
        if (typeof childProcess.pid === "undefined") {
          // deno-lint-ignore no-unsafe-finally
          throw new Error("no pid for childProcess");
        }
        process.kill(-childProcess.pid, "SIGTERM");
        console.log(`posix > ${pid} > before stdout end`)
        yield* once(childProcess.stdout, "end");
        console.log(`posix > ${pid} > after stdout end`)
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
    console.log(`posix > ${pid} > expect: ${JSON.stringify(status)}`)
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
