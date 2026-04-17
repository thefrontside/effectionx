import { createApi } from "@effectionx/context-api";
import type { StdioApi } from "./exec/types.ts";

/**
 * Context API used to observe or customize process stdio handling.
 *
 * By default, `stdout` and `stderr` are written directly to the host process
 * streams. Middleware can wrap this API via `Stdio.around(...)` to capture,
 * transform, or redirect child process output.
 *
 * @example
 * ```ts
 * import { main } from "effection";
 * import { Stdio, exec } from "@effectionx/process";
 *
 * await main(function* () {
 *   let outputStdout: Uint8Array[] = [];
 *   let outputStderr: Uint8Array[] = [];
 *
 *   // affects child processes in this scope
 *   // and all child scopes unless overridden
 *   yield* Stdio.around({
 *     *stdout(line, next) {
 *       const [bytes] = line;
 *       outputStdout.push(bytes);
 *       return yield* next(line);
 *     },
 *     *stderr(line, next) {
 *       const [bytes] = line;
 *       outputStderr.push(bytes);
 *       return yield* next(line);
 *     },
 *   });
 *
 *   yield* exec("node ./fixtures/hello-world.js", {
 *     cwd: import.meta.dirname,
 *   }).expect();
 * });
 * ```
 */
export const Stdio = createApi<StdioApi>("@effectionx/stdio", {
  *stdout(line) {
    process.stdout.write(line);
  },
  *stderr(line) {
    process.stderr.write(line);
  },
});
