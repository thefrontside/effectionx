import type { Operation, Stream } from "effection";

/**
 * Transforms a stream by taking each item and applying it to an
 * accumulated value to produce a new accumulated value which is then
 *  passed downstream.
 *
 * @example
 * ```ts
 * import { reduce, streamOf } from "@effectionx/stream-helpers";
 *
 * const sum = reduce(function*(total: number, item: number) {
 *   return sum + number;
 * }, 0);
 *
 * sum(streamOf([1,2,3])) //=> yields 1, 3, 6
 * ```
 *
 * @param fn - The operation to apply a single item to the accumulated value
 * @param initial - The first accumulated value from which all others will descend
 * @returns A stream transformer that applies the reduction over the lifetime of the stream
 */
export function reduce<T, TSum>(
  fn: (current: TSum, item: T) => Operation<TSum>,
  initial: TSum,
): <TClose>(stream: Stream<T, TClose>) => Stream<TSum, TClose> {
  return (upstream) => ({
    *[Symbol.iterator]() {
      let current = initial;
      let subscription = yield* upstream;

      return {
        *next() {
          let next = yield* subscription.next();
          if (next.done) {
            return next;
          }
          let reduction = yield* fn(current, next.value);

          current = reduction;

          return { done: false, value: current } as const;
        },
      };
    },
  });
}
