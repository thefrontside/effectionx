import type { Operation, Stream } from "effection";

/**
 * Transforms each item in the stream using the provided function.
 *
 * @param fn - The function to transform each item
 * @returns A stream transformer that applies the function to each item
 */
export function map<A, B>(
  fn: (value: A) => Operation<B>,
): <TClose>(stream: Stream<A, TClose>) => Stream<B, TClose> {
  return function (stream) {
    return {
      *[Symbol.iterator]() {
        const subscription = yield* stream;

        return {
          *next() {
            const next = yield* subscription.next();
            if (next.done) {
              return next;
            }

            return {
              done: false,
              value: yield* fn(next.value),
            };
          },
        };
      },
    };
  };
}
