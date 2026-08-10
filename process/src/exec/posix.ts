import { type ChildProcess, spawn as spawnProcess } from "node:child_process";
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
  race,
  spawn,
  withResolvers,
} from "effection";
import { unbox, useEvalScope } from "@effectionx/scope-eval";
import { fromReadable } from "@effectionx/node/stream";
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
import { settled } from "./shutdown.ts";

type ProcessResultValue = [number?, string?];

export function* createPosixProcess(
  command: string,
  options: ExecOptions,
): Operation<Process> {
  let exitResult = withResolvers<Result<ProcessResultValue>>();
  let processResult = withResolvers<Result<ProcessResultValue>>();
  const evalScope = yield* useEvalScope();
  const result = yield* evalScope.eval(function* () {
    let stdoutDone = withResolvers<void>();
    let stderrDone = withResolvers<void>();

    let childProcess: ChildProcess | undefined;
    let teardownStarted = false;

    const shutdown = options.shutdown ?? "graceful";

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

    function* terminate(): Operation<void> {
      let pid = childProcess?.pid;
      if (typeof pid !== "undefined") {
        try {
          process.kill(-pid, "SIGKILL");
        } catch (_error) {}
      }
    }

    function* reaped(): Operation<void> {
      yield* processResult.operation;
    }

    function* closed(): Operation<void> {
      yield* all([
        processResult.operation,
        stdoutDone.operation,
        stderrDone.operation,
      ]);
    }

    function* shutdownProcess(join: () => Operation<void>): Operation<void> {
      let pid = childProcess?.pid;
      if (typeof pid === "undefined") {
        return;
      }

      function* gracefulCompletion(): Operation<ShutdownMode> {
        yield* join();
        return "graceful";
      }

      if (shutdown === "forced") {
        yield* terminate();
      } else {
        try {
          process.kill(-pid, "SIGTERM");
        } catch (_error) {}

        if (typeof shutdown === "function") {
          let mode: ShutdownMode;
          try {
            mode = yield* race([gracefulCompletion(), shutdown({ exit })]);
          } catch (_error) {
            mode = "forced";
          }
          if (mode === "forced") {
            yield* terminate();
          }
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
    const child = spawnProcess(command, options.arguments || [], {
      detached: true,
      shell: options.shell,
      env: options.env,
      cwd: options.cwd,
      stdio: "pipe",
    });
    childProcess = child;

    // Node listeners instead of spawned effection watchers: exit observation
    // must arm in the same synchronous continuation as the spawn so that the
    // guard above can join on it no matter where a halt lands.
    child.once("error", (error) => {
      exitResult.resolve(Err(error));
      processResult.resolve(Err(error));
    });
    child.once("exit", (code, signal) => {
      exitResult.resolve(Ok([code ?? undefined, signal ?? undefined]));
    });
    child.once("close", (code, signal) => {
      processResult.resolve(Ok([code ?? undefined, signal ?? undefined]));
    });

    let { pid } = child;

    if (!child.stdout || !child.stderr) {
      throw new Error("stdout and stderr must be available with stdio: pipe");
    }

    let io = {
      stdout: yield* fromReadable(child.stdout),
      stderr: yield* fromReadable(child.stderr),
    };

    let stdout = createSignal<Uint8Array, void>();
    let stderr = createSignal<Uint8Array, void>();

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
