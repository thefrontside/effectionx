import { spawn as spawnProcess } from "node:child_process";
import process from "node:process";
import {
  type Operation,
  type Result,
  type Yielded,
  Err,
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
import { type ProcessResultValue, useNativeProcess } from "./native.ts";
import { CloseEvent } from "./internal.ts";

export function* createPosixProcess(
  command: string,
  options: ExecOptions,
): Operation<Process> {
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
    const os = yield* useNativeProcess(() =>
      spawnProcess(command, options.arguments || [], {
        detached: true,
        shell: options.shell,
        env: options.env,
        cwd: options.cwd,
        stdio: "pipe",
      }),
    );

    let { childProcess } = os;
    let { pid } = childProcess;

    let processResult = withResolvers<Result<ProcessResultValue>>();

    let io = {
      stdoutDone: withResolvers<void>(),
      stderrDone: withResolvers<void>(),
    };

    let stdout = createSignal<Uint8Array, void>();
    let stderr = createSignal<Uint8Array, void>();

    yield* spawn(function* () {
      let subscription = yield* os.stdout;
      try {
        let next = yield* subscription.next();
        while (!next.done) {
          yield* Stdio.operations.stdout(next.value);
          stdout.send(next.value);
          next = yield* subscription.next();
        }
      } catch (error) {
        // deliver Stdio middleware failures through join()/expect() so a
        // broken handler cannot leave callers waiting on processResult
        processResult.resolve(Err(error as Error));
      } finally {
        stdout.close();
        io.stdoutDone.resolve();
      }
    });

    yield* spawn(function* () {
      let subscription = yield* os.stderr;
      try {
        let next = yield* subscription.next();
        while (!next.done) {
          yield* Stdio.operations.stderr(next.value);
          stderr.send(next.value);
          next = yield* subscription.next();
        }
      } catch (error) {
        processResult.resolve(Err(error as Error));
      } finally {
        stderr.close();
        io.stderrDone.resolve();
      }
    });

    let stdin: Writable<string> = {
      send(data: string) {
        childProcess.stdin?.write(data);
      },
    };

    yield* spawn(function* () {
      let value = yield* os.result;
      let closeEvent = yield* CloseEvent.get();
      if (closeEvent) {
        yield* closeEvent();
      }
      // join() settles only after every chunk has also cleared Stdio
      // middleware and the public signals
      yield* all([io.stdoutDone.operation, io.stderrDone.operation]);
      processResult.resolve(value);
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
