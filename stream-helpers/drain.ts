import type { Operation, Stream } from "effection";

/**
 * Exhausts a stream, discarding all yielded values, and returns the close value.
 *
 * Use this when you only care about the final result of a stream, not the
 * intermediate values. This is common for request/response patterns where
 * the response is the close value and there may be no progress events.
 *
 * @template T - The type of items in the stream (discarded)
 * @template TClose - The type of the close value returned when the stream ends
 * @param stream - The stream to drain
 * @returns The close value of the stream
 *
 * @example
 * ```typescript
 * import { drain } from "./drain.ts";
 *
 * // Get the response from a request channel (ignoring any progress)
 * const channel = yield* transport.send(request);
 * const response = yield* drain(channel);
 * ```
 */
export function drain<T, TClose>(stream: Stream<T, TClose>): Operation<TClose> {
  return {
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      let result = yield* subscription.next();
      while (!result.done) {
        result = yield* subscription.next();
      }
      return result.value;
    },
  };
}
