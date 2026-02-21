import shellwords from "shellwords-ts";

import {
  type Api,
  type Operation,
  createApi,
  resource,
  spawn,
} from "effection";
import type {
  CreateOSProcess,
  ExecOptions,
  ExitStatus,
  Process,
  ProcessResult,
} from "./exec/api.ts";
import { DaemonExitError } from "./exec/error.ts";
import { createPosixProcess } from "./exec/posix.ts";
import { createWin32Process, isWin32 } from "./exec/win32.ts";

export * from "./exec/api.ts";
export * from "./exec/error.ts";

export interface Exec extends Operation<Process> {
  join(): Operation<ProcessResult>;
  expect(): Operation<ProcessResult>;
}

export interface Daemon extends Operation<void>, Process {}

const createOSProcess: CreateOSProcess = (cmd, opts) => {
  if (isWin32()) {
    return createWin32Process(cmd, opts);
  }
  return createPosixProcess(cmd, opts);
};

/**
 * Core interface for the process API operations.
 * Used internally by createApi to enable middleware support.
 */
interface ProcessApiCore {
  /**
   * Execute a command and return the process.
   * This is the core exec operation that middleware can intercept.
   */
  exec(command: string, options: ExecOptions): Operation<Process>;

  /**
   * Start a long-running daemon process.
   * This is the core daemon operation that middleware can intercept.
   */
  daemon(command: string, options: ExecOptions): Operation<Daemon>;
}

/**
 * The process API object that supports middleware decoration.
 *
 * Use `processApi.around()` to add middleware for logging, mocking, or instrumentation.
 *
 * @example
 * ```ts
 * import { processApi, exec } from "@effectionx/process";
 * import { run } from "effection";
 *
 * await run(function*() {
 *   // Add logging middleware
 *   yield* processApi.around({
 *     *exec(args, next) {
 *       let [cmd, opts] = args;
 *       console.log("Executing:", cmd);
 *       return yield* next(...args);
 *     }
 *   });
 *
 *   // All exec calls in this scope now log
 *   let result = yield* exec("echo hello").join();
 * });
 * ```
 *
 * @example
 * ```ts
 * // Mock daemon processes for testing
 * await run(function*() {
 *   yield* processApi.around({
 *     *daemon(args, next) {
 *       let [cmd] = args;
 *       console.log("Starting daemon:", cmd);
 *       return yield* next(...args);
 *     }
 *   });
 *
 *   // daemon() calls in this scope now log
 *   let server = yield* daemon("node server.js");
 * });
 * ```
 */
export const processApi: Api<ProcessApiCore> = createApi("process", {
  *exec(command: string, options: ExecOptions = {}): Operation<Process> {
    let [cmd, ...args] = options.shell ? [command] : shellwords.split(command);
    let opts = { ...options, arguments: args.concat(options.arguments || []) };
    return yield* createOSProcess(cmd, opts);
  },

  *daemon(command: string, options: ExecOptions = {}): Operation<Daemon> {
    return yield* resource(function* (provide) {
      let [cmd, ...args] = options.shell
        ? [command]
        : shellwords.split(command);
      let opts = {
        ...options,
        arguments: args.concat(options.arguments || []),
      };
      let process = yield* createOSProcess(cmd, opts);

      yield* provide({
        *[Symbol.iterator]() {
          let status: ExitStatus = yield* process.join();
          throw new DaemonExitError(status, command, options);
        },
        ...process,
      });
    });
  },
});

/**
 * Execute `command` with `options`. You should use this operation for processes
 * that have a finite lifetime and on which you may wish to synchronize on the
 * exit status. If you want to start a process like a server that spins up and runs
 * forever, consider using `daemon()`
 *
 * This function supports middleware via {@link processApi}. Use `processApi.around()`
 * to add logging, mocking, or other middleware that will intercept all exec calls.
 */
export function exec(command: string, options: ExecOptions = {}): Exec {
  function* doExec(): Operation<Process> {
    return yield* processApi.operations.exec(command, options);
  }

  return {
    *[Symbol.iterator]() {
      return yield* doExec();
    },
    *join() {
      const process = yield* doExec();

      let stdout = "";
      let stderr = "";

      yield* spawn(function* () {
        let subscription = yield* process.stdout;
        let next = yield* subscription.next();
        while (!next.done) {
          stdout += next.value;
          next = yield* subscription.next();
        }
      });

      yield* spawn(function* () {
        let subscription = yield* process.stderr;
        let next = yield* subscription.next();
        while (!next.done) {
          stderr += next.value;
          next = yield* subscription.next();
        }
      });

      let status: ExitStatus = yield* process.join();

      return { ...status, stdout, stderr };
    },
    *expect() {
      const process = yield* doExec();

      let stdout = "";
      let stderr = "";

      yield* spawn(function* () {
        let subscription = yield* process.stdout;
        let next = yield* subscription.next();
        while (!next.done) {
          stdout += next.value;
          next = yield* subscription.next();
        }
      });

      yield* spawn(function* () {
        let subscription = yield* process.stderr;
        let next = yield* subscription.next();
        while (!next.done) {
          stderr += next.value;
          next = yield* subscription.next();
        }
      });

      let status: ExitStatus = yield* process.expect();

      return { ...status, stdout, stderr };
    },
  };
}

/**
 * Start a long-running process, like a web server that run perpetually.
 * Daemon operations are expected to run forever, and if they exit pre-maturely
 * before the operation containing them passes out of scope it raises an error.
 *
 * This function supports middleware via {@link processApi}. Use `processApi.around()`
 * to add logging, mocking, or other middleware that will intercept all daemon calls.
 */
export function daemon(
  command: string,
  options: ExecOptions = {},
): Operation<Daemon> {
  return processApi.operations.daemon(command, options);
}
