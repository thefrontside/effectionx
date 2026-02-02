import type { Operation, Stream } from "effection";

/**
 * Invoke a function for each item passing through the stream.
 *
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value returned when the stream ends
 * @param fn - A function that processes each item from the stream.
 * @param stream: A stream to process
 *
 * @example
 * ```typescript
 * import { forEach } from "./for-each.ts";
 * import { createSignal } from "effection";
 *
 * // Process items from a stream
 * const stream = createSignal<number, void>();
 *
 * yield* spawn(() => forEach(function*(item) {
 *   console.log(`Processing: ${item}`);
 * }, stream));
 *
 * yield* stream.send(1);
 * yield* stream.send(2);
 * ```
 */
export function forEach<T, TClose>(
  fn: (item: T) => Operation<void>,
  stream: Stream<T, TClose>,
): Operation<TClose> {
  return {
    *[Symbol.iterator]() {
      let subscription = yield* stream;
      let next = yield* subscription.next();
      while (!next.done) {
        yield* fn(next.value);
        next = yield* subscription.next();
      }
      return next.value;
    },
  };
}
