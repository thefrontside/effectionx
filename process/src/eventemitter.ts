import { createSignal, resource, withResolvers } from "effection";
import type { Operation, Stream, Subscription } from "effection";
import type { EventEmitter } from "node:stream";

/**
 * Create a {@link Stream} of events from any EventEmitter.
 *
 * See the guide on [Streams and Subscriptions](https://frontside.com/effection/docs/collections)
 * for details on how to use streams.
 *
 * @param target - the event target whose events will be streamed
 * @param name - the name of the event to stream. E.g. "click"
 * @returns a stream that will see one item for each event
 */
export function on<
  T extends unknown[],
>(target: EventEmitter | null, eventName: string): Stream<T, never> {
  return resource(function* (provide) {
    let signal = createSignal<T, never>();

    let listener = (...args: T) => signal.send(args);

    target?.on(eventName, listener);

    try {
      yield* provide(
        yield* signal as Operation<
          Subscription<T, never>
        >,
      );
    } finally {
      target?.off(eventName, listener);
    }
  });
}

/**
 * Create an {@link Operation} that yields the next event to be emitted by an EventEmitter.
 *
 * @param target - the event target to be watched
 * @param name - the name of the event to watch. E.g. "click"
 * @returns an Operation that yields the next emitted event
 */
export function once<TArgs extends unknown[] = unknown[]>(
  source: EventEmitter | null,
  eventName: string,
): Operation<TArgs> {
  const result = withResolvers<TArgs>();

  let listener = (...args: unknown[]) => {
    result.resolve(args as TArgs);
    source?.off(eventName, listener);
  };

  source?.on(eventName, listener);

  return result.operation;
}
