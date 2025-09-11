import type { Operation, Stream } from "effection";

/**
 * Creates a forEach operation that processes each item in a stream using the provided function.
 * 
 * This function creates a curried operation that, when executed, will:
 * 1. Subscribe to the stream
 * 2. Process each item using the provided function
 * 3. Return the close value when the stream ends
 * 
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value returned when the stream ends
 * 
 * @param fn - A function that processes each item from the stream. Must return an Operation<void>
 * @param stream - The stream to process items from
 * 
 * @returns A function that, when called, returns an Operation that processes the stream and returns the close value
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
 * 
 * @example
 * ```typescript
 * // Using with curried syntax (more common pattern)
 * const processor = forEach(function*(item: string) {
 *   yield* writeToFile(item);
 * });
 * 
 * yield* processor(someStream);
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
