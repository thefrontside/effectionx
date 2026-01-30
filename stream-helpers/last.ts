import type { Operation, Stream } from "effection";

/**
 * Returns the last value yielded by a stream.
 *
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
 * const value = yield* last(stream); // returns 3
 * ```
 *
 * @example
 * ```typescript
 * // Throws if stream is empty
 * const empty = streamOf([]);
 * const value = yield* last(empty); // throws Error
 * ```
 */
export function* last<T, TClose>(stream: Stream<T, TClose>): Operation<T> {
  const subscription = yield* stream;
  let hasValue = false;
  let lastValue: T;
  let result = yield* subscription.next();
  while (!result.done) {
    hasValue = true;
    lastValue = result.value;
    result = yield* subscription.next();
  }
  if (!hasValue) {
    throw new Error("Stream closed without yielding any values");
  }
  return lastValue!;
}
