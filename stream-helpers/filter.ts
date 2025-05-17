import type { Operation, Stream } from "effection";

/**
 * Filters items from the stream based on a predicate function.
 *
 * @param predicate - The function to test each item
 * @returns A stream transformer that only emits items that pass the predicate
 *
 * @example
 * ```typescript
 * import { filter } from "@effectionx/stream-helpers";
 * import { run, each } from "effection";
 *
 * await run(function* () {
 *   const stream = filter((x: number) => x > 5)(sourceStream);
 *
 *   for (const value of yield* each(stream)) {
 *     console.log(value); // Only values > 5
 *   }
 * });
 * ```
 */
export function filter<T>(
  predicate: (value: T) => Operation<boolean>,
): <TDone>(stream: Stream<T, TDone>) => Stream<T, TDone> {
  return function (stream) {
    return {
      *[Symbol.iterator]() {
        const subscription = yield* stream;

        return {
          *next() {
            while (true) {
              const next = yield* subscription.next();
              if (next.done) {
                return next;
              }
              if (yield* predicate(next.value)) {
                return {
                  done: false,
                  value: next.value,
                };
              }
            }
          },
        };
      },
    };
  };
}
