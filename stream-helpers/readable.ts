import type { Readable } from "node:stream";
import type { Stream } from "effection";
import { createSignal, resource } from "effection";

/**
 * Convert a Node.js Readable stream to an Effection Stream.
 *
 * @example
 * ```ts
 * import fs from "node:fs";
 * import { fromReadable } from "@effectionx/stream-helpers";
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

    const listener = (chunk: Uint8Array) => {
      signal.send(chunk);
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
    target.on("end", signal.close);
    target.on("error", errorHandler);

    try {
      yield* provide(yield* signal);
    } finally {
      target.off("data", listener);
      target.off("end", signal.close);
      target.off("error", errorHandler);
      signal.close();
    }
  });
}
