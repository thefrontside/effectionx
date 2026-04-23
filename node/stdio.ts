import process from "node:process";
import { type Api, createApi } from "@effectionx/context-api";
import type { Operation, Stream } from "effection";
import { fromReadable } from "./stream.ts";

/**
 * Middleware-capable shape for host-process stdio.
 *
 * `stdin` yields a readable byte stream sourced from the host's standard
 * input. `stdout` and `stderr` take bytes and write them to the host's
 * corresponding output streams.
 */
export interface StdioApi {
  stdin(): Operation<Stream<Uint8Array, void>>;
  stdout(bytes: Uint8Array): Operation<void>;
  stderr(bytes: Uint8Array): Operation<void>;
}

/**
 * Context API used to observe or customize the host process's stdio.
 *
 * By default, `stdin` reads from `process.stdin`, and `stdout` / `stderr`
 * write to `process.stdout` / `process.stderr`. Middleware can wrap this API
 * via `Stdio.around(...)` to capture, transform, or redirect bytes — useful
 * for tests that assert what was written to stdout, or harnesses that feed
 * synthesized stdin.
 *
 * This is distinct from `@effectionx/process`'s `Stdio`, which governs child
 * process stdio.
 *
 * @example
 * ```ts
 * import { main } from "effection";
 * import { Stdio, stdout } from "@effectionx/node";
 *
 * await main(function* () {
 *   const captured: Uint8Array[] = [];
 *
 *   yield* Stdio.around({
 *     *stdout(args, next) {
 *       captured.push(args[0]);
 *       return yield* next(...args);
 *     },
 *   });
 *
 *   yield* stdout(new TextEncoder().encode("hello\n"));
 *   // bytes flow into `captured` instead of the terminal
 * });
 * ```
 */
export const Stdio: Api<StdioApi> = createApi<StdioApi>(
  "@effectionx/node/stdio",
  {
    *stdin() {
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
