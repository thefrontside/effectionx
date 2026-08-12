import type { ChildProcess } from "node:child_process";
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
import { CloseEvent } from "./internal.ts";

type ProcessResultValue = [number?, string?];

/**
 * The platform-specific half of a process adapter. `spawn` must create the
 * child process and attach any platform listeners synchronously — it must not
 * suspend. `shutdown` requests termination and then waits on `drained`, which
 * resolves once the output the caller cares about has been delivered.
 */
export interface SpawnStrategy {
  spawn(command: string, options: ExecOptions): ChildProcess;
  shutdown(
    child: ChildProcess,
    drained: () => Operation<void>,
  ): Operation<void>;
}

export function* createNativeProcess(
  command: string,
  options: ExecOptions,
  strategy: SpawnStrategy,
): Operation<Process> {
  let processResult = withResolvers<Result<ProcessResultValue>>();
  const evalScope = yield* useEvalScope();
  const result = yield* evalScope.eval(function* () {
    let rawClose = withResolvers<Result<ProcessResultValue>>();
    let stdoutDone = withResolvers<void>();
    let stderrDone = withResolvers<void>();

    let rawStdout = createSignal<Uint8Array, void>();
    let rawStderr = createSignal<Uint8Array, void>();

    let stdout = createSignal<Uint8Array, void>();
    let stderr = createSignal<Uint8Array, void>();

    let child: ChildProcess | undefined;
    let teardownStarted = false;

    // Guard for halts landing between here and the primary teardown at the
    // end of acquisition: registered while `child` is still undefined, with
    // the spawn following in the same synchronous continuation, so the
    // process never exists without an armed teardown. It joins on the close
    // event alone because the middleware consumers may never have been wired.
    yield* ensure(function* () {
      if (child && !teardownStarted) {
        yield* strategy.shutdown(child, function* () {
          yield* rawClose.operation;
        });
      }
    });

    const spawned = strategy.spawn(command, options);
    child = spawned;

    spawned.once("error", (error) => {
      rawClose.resolve(Err(error));
      processResult.resolve(Err(error));
    });
    spawned.once("close", (code, signal) => {
      rawClose.resolve(Ok([code ?? undefined, signal ?? undefined]));
    });

    if (!spawned.stdout || !spawned.stderr) {
      throw new Error("stdout and stderr must be available with stdio: pipe");
    }

    // Native listeners, wired in the same synchronous continuation as the
    // spawn. Chunk delivery is synchronous with stream emission and Node
    // emits the child "close" event only after both stdio streams have
    // closed, so by the time rawClose resolves every chunk is already in the
    // raw signals: close-settled means raw-output-complete by construction.
    spawned.stdout.on("data", (chunk: Uint8Array) => rawStdout.send(chunk));
    spawned.stdout.once("close", () => rawStdout.close());
    spawned.stderr.on("data", (chunk: Uint8Array) => rawStderr.send(chunk));
    spawned.stderr.once("close", () => rawStderr.close());

    yield* spawn(function* () {
      let subscription = yield* rawStdout;
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
        stdoutDone.resolve();
      }
    });

    yield* spawn(function* () {
      let subscription = yield* rawStderr;
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
        stderrDone.resolve();
      }
    });

    yield* spawn(function* () {
      let result = yield* rawClose.operation;
      let closeEvent = yield* CloseEvent.get();
      if (closeEvent) {
        yield* closeEvent();
      }
      // join() settles only after every chunk has also cleared Stdio
      // middleware and the public signals
      yield* all([stdoutDone.operation, stderrDone.operation]);
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
      let status: ExitStatus = yield* join();
      if (status.code !== 0) {
        throw new ExecError(status, command, options);
      }
      return status;
    }

    let stdin: Writable<string> = {
      send(data: string) {
        spawned.stdin?.write(data);
      },
    };

    yield* ensure(function* () {
      teardownStarted = true;
      yield* strategy.shutdown(spawned, function* () {
        yield* all([stdoutDone.operation, stderrDone.operation]);
      });
    });

    return {
      pid: spawned.pid as number,
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
