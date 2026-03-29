import type { Operation } from "effection";
import type { OutputStream } from "../helpers.ts";
import type { Api } from "@effectionx/context-api";

/**
 * Writable handle used for process stdin.
 */
export interface Writable<T> {
  send(message: T): void;
}

/**
 * The process type is what is returned by the `exec` operation. It has all of
 * standard io handles, and methods for synchronizing on return.
 */
export interface Process extends StdIO {
  /** Child process id as reported by the operating system. */
  readonly pid: number;

  /**
   * Completes once the process has finished regardless of whether it was
   * successful or not.
   */
  join(): Operation<ExitStatus>;

  /**
   * Completes once the process has finished successfully. If the process does
   * not complete successfully, it will raise an ExecError.
   */
  expect(): Operation<ExitStatus>;

  /**
   * Middleware entrypoint for wrapping stdio behavior using `Stdio` middleware API.
   *
   * @example
   * ```ts
   * import { main } from "effection";
   * import { exec } from "@effectionx/process";
   *
   * await main(function* () {
   *   let proc = yield* exec("node ./fixtures/hello-world.js", {
   *     cwd: import.meta.dirname,
   *   });
   *
   *   let chunks: Uint8Array[] = [];
   *   yield* proc.around({
   *     *stdout(line, next) {
   *       // handle bytes as required
   *       const [bytes] = line;
   *       chunks.push(bytes);
   *       // optionally continue with next middleware
   *       return yield* next(args);
   *     },
   *   });
   *
   *   yield* proc.expect();
   *   console.log(chunks.toString());
   * });
   * ```
   */
  around: Api<StdioApi>["around"];
}

/**
 * Options for spawning a child process.
 */
export interface ExecOptions {
  /**
   * When not using passing the `shell` option all arguments must be passed
   * as an array.
   */
  arguments?: string[];

  /**
   * Map of environment variables to use for the process.
   */
  env?: Record<string, string>;

  /**
   * Create an intermediate shell process; defaults to `false`. Useful if you
   * need to handle glob expansion or passing environment variables. A truthy value
   * will use an intermediate shell to interpret the command using the default system shell.
   * However, if the value is a string, that will be used as the executable path
   * for the intermediate shell.
   */
  shell?: boolean | string;

  /**
   * Sets the working directory of the process
   */
  cwd?: string;
}

export interface StdIO {
  /** Stream of bytes written by the process to standard output. */
  stdout: OutputStream;

  /** Stream of bytes written by the process to standard error. */
  stderr: OutputStream;

  /** Writable interface for sending data to process standard input. */
  stdin: Writable<string>;
}

export interface StdioApi {
  stdout(bytes: Uint8Array): Operation<void>;
  stderr(bytes: Uint8Array): Operation<void>;
}

export interface ExitStatus {
  /**
   * exit code
   */
  code?: number;

  /**
   * If the process exited with a signal instead of an exit code, it
   * is recorded here.
   */
  signal?: string;
}

export interface ProcessResult extends ExitStatus {
  /** Collected stdout text from process execution helpers. */
  stdout: string;

  /** Collected stderr text from process execution helpers. */
  stderr: string;
}
export type CreateOSProcess = (
  command: string,
  options: ExecOptions,
) => Operation<Process>;
