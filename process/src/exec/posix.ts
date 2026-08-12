import { spawn as spawnProcess } from "node:child_process";
import process from "node:process";
import {
  type Result,
  type Operation,
  type Yielded,
  Err,
  Ok,
  all,
  createSignal,
  ensure,
  spawn,
  withResolvers,
} from "effection";
import { unbox, useEvalScope } from "@effectionx/scope-eval";
import type {
  CreateOSProcess,
  ExecOptions,
  ExitStatus,
  Process,
  Writable,
} from "./types.ts";
import { Stdio } from "../api.ts";
import { ExecError } from "./error.ts";

type ProcessResultValue = [number?, string?];

export function* createPosixProcess(
  command: string,
  options: ExecOptions,
): Operation<Process> {
  let processResult = withResolvers<Result<ProcessResultValue>>();
  const evalScope = yield* useEvalScope();
  const result = yield* evalScope.eval(function* () {
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

    if (!childProcess.stdout || !childProcess.stderr) {
      throw new Error("stdout and stderr must be available with stdio: pipe");
    }

    // Native listeners attached in the same synchronous continuation as the
    // spawn: process events and stdio chunks cannot be missed, and no
    // readable pumps are needed.
    childProcess.once("error", (error) => {
      processResult.resolve(Err(error));
    });
    childProcess.once("close", (code, signal) => {
      processResult.resolve(Ok([code ?? undefined, signal ?? undefined]));
    });

    let raw = {
      stdout: createSignal<Uint8Array, void>(),
      stderr: createSignal<Uint8Array, void>(),
    };
    childProcess.stdout.on("data", (chunk: Uint8Array) =>
      raw.stdout.send(chunk),
    );
    childProcess.stdout.once("close", () => raw.stdout.close());
    childProcess.stderr.on("data", (chunk: Uint8Array) =>
      raw.stderr.send(chunk),
    );
    childProcess.stderr.once("close", () => raw.stderr.close());

    let io = {
      stdoutDone: withResolvers<void>(),
      stderrDone: withResolvers<void>(),
    };

    let stdout = createSignal<Uint8Array, void>();
    let stderr = createSignal<Uint8Array, void>();

    yield* spawn(function* () {
      let subscription = yield* raw.stdout;
      let next = yield* subscription.next();
      while (!next.done) {
        yield* Stdio.operations.stdout(next.value);
        stdout.send(next.value);
        next = yield* subscription.next();
      }
      stdout.close();
      io.stdoutDone.resolve();
    });

    yield* spawn(function* () {
      let subscription = yield* raw.stderr;
      let next = yield* subscription.next();
      while (!next.done) {
        yield* Stdio.operations.stderr(next.value);
        stderr.send(next.value);
        next = yield* subscription.next();
      }
      stderr.close();
      io.stderrDone.resolve();
    });

    let stdin: Writable<string> = {
      send(data: string) {
        childProcess.stdin.write(data);
      },
    };

    function* join() {
      let result = yield* processResult.operation;
      if (result.ok) {
        let [code, signal] = result.value;
        return { command, options, code, signal } as ExitStatus;
      }
      throw result.error;
    }

    function* expect() {
      let status: ExitStatus = yield* join();
      if (status.code !== 0) {
        throw new ExecError(status, command, options);
      }
      return status;
    }

    yield* ensure(function* () {
      try {
        if (typeof childProcess.pid === "undefined") {
          throw new Error("no pid for childProcess");
        }
        process.kill(-childProcess.pid, "SIGTERM");
        yield* all([io.stdoutDone.operation, io.stderrDone.operation]);
      } catch (_e) {
        // do nothing, process is probably already dead
      }
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
