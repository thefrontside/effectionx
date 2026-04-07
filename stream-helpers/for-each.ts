import {
  type Operation,
  type Stream,
  type Task,
  resource,
  spawn,
} from "effection";

/**
 * Subscribe to a stream and invoke a function for each item, returning a
 * {@link Task} that resolves to the stream's close value.
 *
 * Because `forEach` is a resource, the subscription is established as soon as
 * it is yielded, **before** the consumer loop begins. This makes it safe to
 * use without an extra `spawn` + `sleep(0)` dance.
 *
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value returned when the stream ends
 * @param fn - A function that processes each item from the stream.
 * @param stream - A stream to process
 *
 * @example
 * ```typescript
 * import { forEach } from "./for-each.ts";
 * import { createSignal } from "effection";
 *
 * // Background usage – subscribes and runs without blocking
 * yield* forEach(function*(item) {
 *   console.log(`Processing: ${item}`);
 * }, stream);
 *
 * // Blocking usage – waits until the stream closes
 * yield* (yield* forEach(function*(item) {
 *   console.log(`Processing: ${item}`);
 * }, stream));
 * ```
 */
export function forEach<T, TClose>(
  fn: (item: T) => Operation<void>,
  stream: Stream<T, TClose>,
): Operation<Task<TClose>> {
  return resource(function* (provide) {
    const subscription = yield* stream;
    const task = yield* spawn(function* (): Operation<TClose> {
      let next = yield* subscription.next();
      while (!next.done) {
        yield* fn(next.value);
        next = yield* subscription.next();
      }
      return next.value;
    });
    yield* provide(task);
  });
}
