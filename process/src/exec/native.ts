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

    // Registered while `child` is still undefined; the spawn below follows
    // in the same synchronous continuation, so the process never exists
    // without this teardown armed.
    yield* ensure(function* () {
      if (child) {
        if (child.exitCode === null && child.signalCode === null) {
          child.kill("SIGTERM");
        }
        // hold the scope until the OS has reaped the process and closed its
        // pipes; `result` is a value, so an error outcome cannot throw here
        yield* result.operation;
      }
    });

    const spawned = create();
    child = spawned;

    spawned.once("error", (error) => {
      result.resolve(Err(error));
    });
    spawned.once("close", (code, signal) => {
      result.resolve(Ok([code ?? undefined, signal ?? undefined]));
    });

    if (!spawned.stdout || !spawned.stderr) {
      throw new Error("stdout and stderr must be available with stdio: pipe");
    }
    spawned.stdout.on("data", (chunk: Uint8Array) => stdout.send(chunk));
    spawned.stdout.once("close", () => stdout.close());
    spawned.stderr.on("data", (chunk: Uint8Array) => stderr.send(chunk));
    spawned.stderr.once("close", () => stderr.close());

    yield* provide({
      childProcess: spawned,
      stdout,
      stderr,
      result: result.operation,
    });
  });
}
