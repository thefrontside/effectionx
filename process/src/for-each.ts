import type { Operation, Stream } from "effection";

/**
 * Creates a forEach operation that processes each item in a stream using the provided function.
 * 
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value returned when the stream ends
 * 
 * @param fn - A function that processes each item from the stream.
 * @param stream - The stream to process items from
 * 
 * @example
 * ```typescript
 * import { forEach } from "./for-each.ts";
 * import { createChannel } from "effection";
 * 
 * // Process items from a stream
 * const [send, stream] = createChannel<number, void>();
 * 
 * yield* spawn(() => forEach(function*(item) {
 *   console.log(`Processing: ${item}`);
 * }, stream)());
 * 
 * yield* send(1);
 * yield* send(2);
 * ```
 */
export function forEach<T, TClose>(
  fn: (chunk: T) => Operation<void>,
  stream: Stream<T, TClose>,
): () => Operation<TClose> {
  return function* () {
    let subscription = yield* stream;
    let next = yield* subscription.next();
    while (!next.done) {
      yield* fn(next.value);
      next = yield* subscription.next();
    }
    return next.value;
  };
}
