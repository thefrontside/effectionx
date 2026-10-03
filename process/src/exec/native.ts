import type { ChildProcess } from "node:child_process";
import {
  type Operation,
  type Result,
  type Stream,
  Err,
  Ok,
  createSignal,
  ensure,
  resource,
  withResolvers,
} from "effection";

export type ProcessResultValue = [number?, string?];

/**
 * A child process as a resource, wired entirely through native Node event
 * listeners: exit through the `close` event, output pushed straight into
 * signals. All listeners are attached in the same synchronous continuation
 * as the spawn, so no event can be missed.
 *
 * Standard cleanup: if the process is still alive when the scope exits it is
 * sent SIGTERM with `child.kill()`, and the scope is held open until the OS
 * has reaped the process and closed its stdio pipes. Platform-specific
 * termination (process groups, ctrlc, force kill) belongs to the caller's
 * own teardown, which runs before this backstop.
 */
export interface NativeProcess {
  childProcess: ChildProcess;

  /**
   * Hot streams: chunks that arrive before a subscription exists are
   * dropped. Subscribe in the same continuation that acquires the resource,
   * before awaiting `result`.
   */
  stdout: Stream<Uint8Array, void>;
  stderr: Stream<Uint8Array, void>;

  /** The `close` event value, or the error that prevented the spawn. */
  result: Operation<Result<ProcessResultValue>>;
}

export function useNativeProcess(
  create: () => ChildProcess,
): Operation<NativeProcess> {
  return resource(function* (provide) {
    let result = withResolvers<Result<ProcessResultValue>>();
    let stdout = createSignal<Uint8Array, void>();
    let stderr = createSignal<Uint8Array, void>();

    let child: ChildProcess | undefined;

    let onError = (error: Error) => {
      result.resolve(Err(error));
    };
    let onClose = (code: number | null, signal: NodeJS.Signals | null) => {
      result.resolve(Ok([code ?? undefined, signal ?? undefined]));
    };
    let onStdout = (chunk: Uint8Array) => stdout.send(chunk);
    let onStdoutClose = () => stdout.close();
    let onStderr = (chunk: Uint8Array) => stderr.send(chunk);
    let onStderrClose = () => stderr.close();

    // Registered while `child` is still undefined; the spawn below follows
    // in the same synchronous continuation, so the process never exists
    // without this teardown armed.
    yield* ensure(function* () {
      if (child) {
        try {
          if (child.exitCode === null && child.signalCode === null) {
            child.kill("SIGTERM");
          }
          // hold the scope until the OS has reaped the process and closed its
          // pipes; `result` is a value, so an error outcome cannot throw here
          yield* result.operation;
        } finally {
          // deregistration is bound to this scope, never to an event firing,
          // because the pipes may be shared beyond this process. It follows
          // the wait above, which needs `onClose` still attached, but must
          // not depend on that wait completing — hence the sync finally.
          child.off("error", onError);
          child.off("close", onClose);
          child.stdout?.off("data", onStdout);
          child.stdout?.off("close", onStdoutClose);
          child.stderr?.off("data", onStderr);
          child.stderr?.off("close", onStderrClose);
        }
      }
    });

    const spawned = create();
    child = spawned;

    spawned.on("error", onError);
    spawned.on("close", onClose);

    if (!spawned.stdout || !spawned.stderr) {
      throw new Error("stdout and stderr must be available with stdio: pipe");
    }

    // Node emits the child "close" event only after both stdio streams have
    // closed, and these listeners run synchronously with stream emission, so
    // by the time `result` resolves every chunk is already in the signals.
    spawned.stdout.on("data", onStdout);
    spawned.stdout.on("close", onStdoutClose);
    spawned.stderr.on("data", onStderr);
    spawned.stderr.on("close", onStderrClose);

    yield* provide({
      childProcess: spawned,
      stdout,
      stderr,
      result: result.operation,
    });
  });
}
