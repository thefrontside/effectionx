import type { Operation, Stream } from "effection";

/**
 * Returns the first value yielded by a stream, or `undefined` if the stream
 * closes without yielding any values.
 *
 * Use `first.expect()` if you want to throw an error when the stream is empty.
 *
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value (unused)
 * @param stream - The stream to get the first value from
 * @returns The first value yielded by the stream, or `undefined` if empty
 *
 * @example
 * ```typescript
 * import { first } from "./first.ts";
 *
 * const stream = streamOf([1, 2, 3]);
 * const value = yield* first(stream); // returns 1
 *
 * const empty = streamOf([]);
 * const value = yield* first(empty); // returns undefined
 * ```
 */
function _first<T, TClose>(
  stream: Stream<T, TClose>,
): Operation<T | undefined> {
  return {
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      const result = yield* subscription.next();
      if (result.done) {
        return undefined;
      }
      return result.value;
    },
  };
}

/**
 * Returns the first value yielded by a stream.
 * Throws an error if the stream closes without yielding any values.
 *
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value (unused)
 * @param stream - The stream to get the first value from
 * @returns The first value yielded by the stream
 * @throws Error if the stream closes without yielding any values
 *
 * @example
 * ```typescript
 * import { first } from "./first.ts";
 *
 * const stream = streamOf([1, 2, 3]);
 * const value = yield* first.expect(stream); // returns 1
 *
 * const empty = streamOf([]);
 * const value = yield* first.expect(empty); // throws Error
 * ```
 */
function expectFirst<T, TClose>(stream: Stream<T, TClose>): Operation<T> {
  return {
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      const result = yield* subscription.next();
      if (result.done) {
        throw new Error("Stream closed without yielding any values");
      }
      return result.value;
    },
  };
}

export const first = Object.assign(_first, { expect: expectFirst });
