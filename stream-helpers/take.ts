import type { Stream } from "effection";

/**
 * Creates a stream transformer that yields the first `n` values from the
 * source stream, then closes with the last taken value.
 *
 * If the source stream closes before yielding `n` values, the resulting
 * stream closes with the source's close value.
 *
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value
 * @param n - The number of values to take
 * @returns A stream transformer that yields at most `n` values
 *
 * @example
 * ```typescript
 * import { take, streamOf } from "@effectionx/stream-helpers";
 *
 * const stream = streamOf([1, 2, 3, 4, 5]);
 * // yields 1, 2, then closes with 3
 * const limited = take(3)(stream);
 * ```
 *
 * @example
 * ```typescript
 * import { take, map } from "@effectionx/stream-helpers";
 * import { pipe } from "remeda";
 *
 * const limited = pipe(
 *   source,
 *   map(function* (x) { return x * 2; }),
 *   take(5),
 * );
 * ```
 */
export function take<T>(
  n: number,
): <TClose>(stream: Stream<T, TClose>) => Stream<T, T | TClose> {
  return <TClose>(stream: Stream<T, TClose>): Stream<T, T | TClose> => ({
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      let count = 0;

      return {
        *next() {
          if (count >= n) {
            // Should not happen if used correctly, but handle gracefully
            return { done: true, value: undefined as unknown as T | TClose };
          }

          const result = yield* subscription.next();
          if (result.done) {
            return result;
          }

          count++;
          if (count >= n) {
            // This is the nth value, return it and mark as done
            return { done: true, value: result.value };
          }

          return result;
        },
      };
    },
  });
}
