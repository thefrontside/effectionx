import { type Operation, resource, type Stream } from "effection";
import { createSetSignal, is } from "./signals.ts";

export interface Tracker extends Operation<void> {
  /**
   * Returns a stream helper that doesn't modify the items passing through the stream,
   * but will capture a reference to the item. Call the `markOne` or `markMany` methods
   * with the item to indicate that it has exited the stream.
   */
  passthrough(): <T>(stream: Stream<T, never>) => Stream<T, never>;
  /**
   * Call this method with an item that has passed through the stream to indicate that it has exited the stream.
   */
  markOne(item: unknown): void;
  /**
   * Call this method with an iterable of items that have passed through the stream to indicate that they have exited the stream.
   */
  markMany(items: Iterable<unknown>): void;
}

/**
 * Creates a tracker that can be used to verify that all items that entered the stream
 * eventually exit the stream. This is helpful when you want to ensure that all items
 * were processed before terminating the operation that created the stream.
 */
export function createTracker(): Operation<Tracker> {
  return resource(function* (provide) {
    const tracked = yield* createSetSignal();

    yield* provide({
      *[Symbol.iterator]() {
        yield* is(tracked, (set) => set.size === 0);
      },
      passthrough() {
        return function <T, TDone>(stream: Stream<T, TDone>): Stream<T, TDone> {
          return {
            *[Symbol.iterator]() {
              const subscription = yield* stream;

              return {
                *next() {
                  const next = yield* subscription.next();
                  tracked.add(next.value);
                  return next;
                },
              };
            },
          };
        };
      },
      markOne(item) {
        tracked.delete(item);
      },
      markMany(items) {
        tracked.difference(items);
      },
    });
  });
}
