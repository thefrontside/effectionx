import type { Stream } from "effection";

/**
 * Creates a stream transformer that yields values from the source stream
 * while the predicate returns true. Closes when the predicate returns false,
 * without including the failing value.
 *
 * When the predicate fails, the stream closes immediately without the failing
 * value. The close value will be `undefined` since we don't have access to
 * the source's close value without draining the entire stream.
 *
 * If the source stream closes before the predicate returns false, the
 * resulting stream closes with the source's close value.
 *
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value
 * @param predicate - A function that returns true to continue taking values
 * @returns A stream transformer that yields values while predicate is true
 *
 * @example
 * ```typescript
 * import { takeWhile, streamOf } from "@effectionx/stream-helpers";
 *
 * const stream = streamOf([1, 2, 3, 4, 5]);
 * // yields 1, 2 (stops when value >= 3)
 * const limited = takeWhile((x: number) => x < 3)(stream);
 * ```
 *
 * @example
 * ```typescript
 * import { takeWhile, map } from "@effectionx/stream-helpers";
 * import { pipe } from "remeda";
 *
 * const limited = pipe(
 *   source,
 *   map(function* (x) { return x * 2; }),
 *   takeWhile((x) => x < 100),
 * );
 * ```
 */
export function takeWhile<T>(
  predicate: (item: T) => boolean,
): <TClose>(stream: Stream<T, TClose>) => Stream<T, TClose | undefined> {
  return <TClose>(
    stream: Stream<T, TClose>,
  ): Stream<T, TClose | undefined> => ({
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      let done = false;

      return {
        *next() {
          if (done) {
            return { done: true, value: undefined as TClose | undefined };
          }

          const result = yield* subscription.next();
          if (result.done) {
            return result;
          }

          if (!predicate(result.value)) {
            done = true;
            // Close immediately without the failing value
            // We return undefined as we don't drain the stream
            return { done: true, value: undefined as TClose | undefined };
          }

          return result;
        },
      };
    },
  });
}
