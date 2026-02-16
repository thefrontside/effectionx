import shellwords from "shellwords-ts";

import { type Api, type Operation, createApi, spawn } from "effection";
import type {
  CreateOSProcess,
  ExecOptions,
  ExitStatus,
  Process,
  ProcessResult,
} from "./exec/api.ts";
import { createPosixProcess } from "./exec/posix.ts";
import { createWin32Process, isWin32 } from "./exec/win32.ts";

export * from "./exec/api.ts";
export * from "./exec/error.ts";

export interface Exec extends Operation<Process> {
  join(): Operation<ProcessResult>;
  expect(): Operation<ProcessResult>;
}

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
   * Create a process operation.
   * This is the core operation that middleware can intercept.
   */
  createProcess(cmd: string, opts: ExecOptions): Operation<Process>;
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
 *     *createProcess(args, next) {
 *       let [cmd, opts] = args;
 *       console.log("Spawning process:", cmd);
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
 * // Mock processes for testing
 * await run(function*() {
 *   yield* processApi.around({
 *     *createProcess(args, next) {
 *       let [cmd] = args;
 *       if (cmd === "expensive-command") {
 *         return createMockProcess({ stdout: "mocked output" });
 *       }
 *       return yield* next(...args);
 *     }
 *   });
 *
 *   // exec("expensive-command") returns mocked data in this scope
 * });
 * ```
 */
export const processApi: Api<ProcessApiCore> = createApi("process", {
  *createProcess(cmd: string, opts: ExecOptions): Operation<Process> {
    return yield* createOSProcess(cmd, opts);
  },
});

/**
 * Execute `command` with `options`. You should use this operation for processes
 * that have a finite lifetime and on which you may wish to synchronize on the
 * exit status. If you want to start a process like a server that spins up and runs
 * forever, consider using `daemon()`
 *
 * This function supports middleware via {@link processApi}. Use `processApi.around()`
 * to add logging, mocking, or other middleware that will intercept all process creation.
 */
export function exec(command: string, options: ExecOptions = {}): Exec {
  let [cmd, ...args] = options.shell ? [command] : shellwords.split(command);
  let opts = { ...options, arguments: args.concat(options.arguments || []) };

  // Use the API's createProcess operation so middleware can intercept
  function* doCreateProcess(): Operation<Process> {
    return yield* processApi.operations.createProcess(cmd, opts);
  }

  return {
    *[Symbol.iterator]() {
      return yield* doCreateProcess();
    },
    *join() {
      const process = yield* doCreateProcess();

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
      const process = yield* doCreateProcess();

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
