import type { Operation, Stream } from "effection";

/**
 * Returns the last value yielded by a stream, or `undefined` if the stream
 * closes without yielding any values.
 *
 * Exhausts the entire stream to find the last value.
 * Use `last.expect()` if you want to throw an error when the stream is empty.
 *
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value (unused)
 * @param stream - The stream to get the last value from
 * @returns The last value yielded by the stream, or `undefined` if empty
 *
 * @example
 * ```typescript
 * import { last } from "./last.ts";
 *
 * const stream = streamOf([1, 2, 3]);
 * const value = yield* last(stream); // returns 3
 *
 * const empty = streamOf([]);
 * const value = yield* last(empty); // returns undefined
 * ```
 */
export function last<T, TClose>(
  stream: Stream<T, TClose>,
): Operation<T | undefined> {
  return {
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      const first = yield* subscription.next();

      if (first.done) {
        return undefined;
      }

      let lastValue: T = first.value;
      let result = yield* subscription.next();

      while (!result.done) {
        lastValue = result.value;
        result = yield* subscription.next();
      }

      return lastValue;
    },
  };
}

/**
 * Returns the last value yielded by a stream.
 * Exhausts the entire stream to find the last value.
 * Throws an error if the stream closes without yielding any values.
 *
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value (unused)
 * @param stream - The stream to get the last value from
 * @returns The last value yielded by the stream
 * @throws Error if the stream closes without yielding any values
 *
 * @example
 * ```typescript
 * import { last } from "./last.ts";
 *
 * const stream = streamOf([1, 2, 3]);
 * const value = yield* last.expect(stream); // returns 3
 *
 * const empty = streamOf([]);
 * const value = yield* last.expect(empty); // throws Error
 * ```
 */
last.expect = function expectLast<T, TClose>(
  stream: Stream<T, TClose>,
): Operation<T> {
  return {
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      const first = yield* subscription.next();

      if (first.done) {
        throw new Error("Stream closed without yielding any values");
      }

      let lastValue: T = first.value;
      let result = yield* subscription.next();

      while (!result.done) {
        lastValue = result.value;
        result = yield* subscription.next();
      }

      return lastValue;
    },
  };
};
