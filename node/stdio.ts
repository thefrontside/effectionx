import process from "node:process";
import { type Api, createApi } from "@effectionx/context-api";
import type { Operation, Stream } from "effection";
import { fromReadable } from "./stream.ts";

/**
 * Middleware-capable shape for host stdio.
 *
 * `stdin` yields a readable byte stream sourced from the host's standard
 * input; `stdout` and `stderr` take bytes and write them to the host's
 * corresponding output streams.
 */
export interface StdioApi {
  stdin(): Stream<Uint8Array, void>;
  stdout(bytes: Uint8Array): Operation<void>;
  stderr(bytes: Uint8Array): Operation<void>;
}

/**
 * Context API used to observe or customize host-process stdio handling.
 *
 * By default, `stdout` and `stderr` are written directly to the host
 * `process.stdout` / `process.stderr` streams. Middleware can wrap this API
 * via `Stdio.around(...)` to capture, transform, or redirect the bytes.
 *
 * @example
 * ```ts
 * import { main } from "effection";
 * import { Stdio } from "@effectionx/node/stdio";
 *
 * await main(function* () {
 *   let captured: Uint8Array[] = [];
 *
 *   yield* Stdio.around({
 *     *stdout(line, next) {
 *       const [bytes] = line;
 *       captured.push(bytes);
 *       return yield* next(line);
 *     },
 *   });
 *
 *   // Any code in this scope (including nested child-process helpers
 *   // that write through `Stdio.operations.stdout`) now flows through
 *   // the middleware instead of the host stdout stream.
 *   yield* Stdio.operations.stdout(new TextEncoder().encode("hello\n"));
 * });
 * ```
 */
export const Stdio: Api<StdioApi> = createApi<StdioApi>(
  "@effectionx/node/stdio",
  {
    stdin() {
      return fromReadable(process.stdin);
    },
    *stdout(bytes) {
      process.stdout.write(bytes);
    },
    *stderr(bytes) {
      process.stderr.write(bytes);
    },
  },
);

export const { stdin, stdout, stderr } = Stdio.operations;
