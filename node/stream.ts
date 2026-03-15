import type { Readable } from "node:stream";
import type { Stream } from "effection";
import { createSignal, resource } from "effection";

/**
 * Convert a Node.js Readable stream to an Effection Stream.
 *
 * @example
 * ```ts
 * import fs from "node:fs";
 * import { fromReadable } from "@effectionx/node/stream";
 * import { each } from "effection";
 *
 * const fileStream = fs.createReadStream("./data.txt");
 *
 * for (const chunk of yield* each(fromReadable(fileStream))) {
 *   console.log(new TextDecoder().decode(chunk));
 *   yield* each.next();
 * }
 * ```
 */
export function fromReadable(target: Readable): Stream<Uint8Array, void> {
  return resource(function* (provide) {
    const signal = createSignal<Uint8Array, void>();

    let ended = false;

    const listener = (chunk: Uint8Array) => {
      signal.send(chunk);
    };

    const endHandler = () => {
      ended = true;
      signal.close();
    };

    // On Windows, when a child process is terminated, the stdio stream may
    // emit 'close' without ever emitting 'end'. In that case we must close
    // the signal so that consumers are unblocked. However, in the normal
    // lifecycle 'end' fires first (after all buffered data has been emitted)
    // and then 'close' follows — closing the signal again on 'close' would
    // race with in-flight 'data' events and drop chunks. The guard ensures
    // we only act on 'close' when 'end' was never received.
    const closeHandler = () => {
      if (!ended) {
        signal.close();
      }
    };

    // On Windows, when a process is killed, the stream may emit an 'error' event
    // with EPIPE before 'end'. We treat this as a normal close since the process
    // was intentionally terminated.
    const errorHandler = (error: Error & { code?: string }) => {
      if (error.code === "EPIPE") {
        signal.close();
      }
    };

    target.on("data", listener);
    target.on("end", endHandler);
    target.on("close", closeHandler);
    target.on("error", errorHandler);

    try {
      yield* provide(yield* signal);
    } finally {
      target.off("data", listener);
      target.off("end", endHandler);
      target.off("close", closeHandler);
      target.off("error", errorHandler);
      signal.close();
    }
  });
}
