import { createSignal, resource, withResolvers } from "effection";
import type { Operation, Stream, Subscription } from "effection";
import type { EventEmitter } from "node:stream";

/**
 * Create an {@link Operation} that yields the next event to be emitted by an EventEmitter.
 *
 * @param target - the event target to be watched
 * @param name - the name of the event to watch. E.g. "click"
 * @returns an Operation that yields the next emitted event
 */
export function once<
  T extends unknown[],
>(target: EventEmitter, eventName: string): Operation<T> {
  return {
    *[Symbol.iterator]() {
      let subscription = yield* on<T>(target, eventName);
      let next = yield* subscription.next();
      return next.value;
    },
  };
}

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
>(target: EventEmitter, eventName: string): Stream<T, never> {
  return resource(function* (provide) {
    let signal = createSignal<T, never>();

    let listener = (...args: T) => signal.send(args);

    target.on(eventName, listener);

    try {
      yield* provide(
        yield* signal as Operation<
          Subscription<T, never>
        >,
      );
    } finally {
      target.off(eventName, listener);
    }
  });
}

/**
 * Exactly like {@link once()} except the value produced is an
 * array of all the arguments passed when the event was
 * dispatched.
 *
 * In very rare cases, some event emitters pass multiple arguments to
 * their event handlers. For example the [ChildProcess](https://nodejs.org/api/child_process.html) in
 * NodeJS emits both a status code _and_ a signal to the 'exit'
 * event. It would not be possible to read the signal from the `exit`
 * event using just the `once()` operation, so you would need to use
 * the `onceEmit()` operation to get all the arguments sent to the
 * event handler as an array.
 *
 * While it is supported, you should never need to use `onceEmit()` on an
 * `EventTarget` since only a single argument is ever passed to its event
 * handler. In those cases, always use {@link once()}
 *
 * ### Example
 *
 * ```javascript
 * let [exitCode, signal] = yield onEmit(childProcess, 'exit');
 * ```
 *
 * @param source an object which emits events
 * @param eventName the name of the event to subscribe to
 * @typeParam TArgs the type of the array of arguments to the emitted event
 */
export function onceEmit<TArgs extends unknown[] = unknown[]>(
  source: EventEmitter,
  eventName: string,
): Operation<TArgs> {
  const result = withResolvers<TArgs>();

  let listener = (...args: unknown[]) => {
    result.resolve(args as TArgs);
    source.off(eventName, listener);
  };

  source.on(eventName, listener);

  return result.operation;
}
