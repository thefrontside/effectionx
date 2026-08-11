import shellwords from "shellwords-ts";

import { type Operation, spawn } from "effection";
import type {
  ExecOptions,
  ExitStatus,
  Process,
  ProcessResult,
} from "./exec/types.ts";

import { ProcessApi } from "../api.ts";

export * from "./exec/types.ts";
export * from "./exec/error.ts";

export interface Exec extends Operation<Process> {
  /**
   * Wait for process completion and return exit status plus captured output.
   */
  join(): Operation<ProcessResult>;

  /**
   * Like `join()`, but throws if the process exits unsuccessfully.
   */
  expect(): Operation<ProcessResult>;
}

/**
 * Execute `command` with `options`. You should use this operation for processes
 * that have a finite lifetime and on which you may wish to synchronize on the
 * exit status. If you want to start a process like a server that spins up and runs
 * forever, consider using `daemon()`
 *
 * @example
 * ```ts
 * import { main } from "effection";
 * import { exec } from "@effectionx/process";
 *
 * await main(function* () {
 *   let process = yield* exec("node ./fixtures/hello-world.js", {
 *     cwd: import.meta.dirname,
 *   })
 *   let result = yield* process.expect();
 *
 *   console.log(result.code); // 0
 * });
 * ```
 */
export function exec(command: string, options: ExecOptions = {}): Exec {
  let [cmd, ...args] = options.shell ? [command] : shellwords.split(command);
  let opts = { ...options, arguments: args.concat(options.arguments || []) };

  return {
    *[Symbol.iterator]() {
      return yield* ProcessApi.operations.exec(cmd, opts);
    },
    *join() {
      const process = yield* ProcessApi.operations.exec(cmd, opts);

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
      const process = yield* ProcessApi.operations.exec(cmd, opts);

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
