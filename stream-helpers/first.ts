import type { Operation, Stream } from "effection";

/**
 * Returns the first value yielded by a stream.
 *
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
 * const value = yield* first(stream); // returns 1
 * ```
 *
 * @example
 * ```typescript
 * // Throws if stream is empty
 * const empty = streamOf([]);
 * const value = yield* first(empty); // throws Error
 * ```
 */
export function* first<T, TClose>(stream: Stream<T, TClose>): Operation<T> {
  const subscription = yield* stream;
  const result = yield* subscription.next();
  if (result.done) {
    throw new Error("Stream closed without yielding any values");
  }
  return result.value;
}
