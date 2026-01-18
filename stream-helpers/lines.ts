import type { Stream } from "effection";

/**
 * Represents the close value of a lines stream, containing any
 * remaining content that didn't end with a newline.
 */
export interface Remainder<T> {
  remainder: string;
  result: T;
}

/**
 * Stream helper that transforms a stream of binary chunks into a stream of lines.
 *
 * Lines are split on newline characters (`\n`). The final line (content after
 * the last newline) is returned as the `remainder` in the close value.
 *
 * @example
 * ```ts
 * import { lines } from "@effectionx/stream-helpers";
 * import { pipe, each } from "effection";
 *
 * const lineStream = pipe(process.stdout, lines());
 * for (const line of yield* each(lineStream)) {
 *   console.log(line);
 *   yield* each.next();
 * }
 * ```
 */
export function lines(): <T extends Uint8Array, TReturn>(
  stream: Stream<T, TReturn>,
) => Stream<string, Remainder<TReturn>> {
  const decoder = new TextDecoder();
  return (stream) => ({
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      const buffer: string[] = [];
      let remainder = "";

      return {
        *next() {
          while (buffer.length === 0) {
            const next = yield* subscription.next();
            if (next.done) {
              return {
                done: true,
                value: {
                  remainder,
                  result: next.value,
                },
              };
            }
            const current = remainder + decoder.decode(next.value);
            const lines = current.split("\n");
            if (lines.length > 0) {
              buffer.push(...lines.slice(0, -1));
              remainder = lines.at(-1) ?? "";
            } else {
              remainder = current;
            }
          }
          const value = buffer.shift();
          if (value === undefined) {
            throw new Error("Unexpected empty buffer");
          }
          return {
            done: false,
            value,
          };
        },
      };
    },
  });
}
