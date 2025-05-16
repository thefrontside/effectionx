import { type Operation, resource, scoped, type Stream } from "effection";
import { createSetSignal, is } from "./signals.ts";

interface Tracker extends Operation<void> {
  passthrough(): <T>(stream: Stream<T, never>) => Stream<T, never>;
  markOne(item: unknown): void;
  markMany(items: Iterable<unknown>): void;
  count: number
}

/**
 * Creates a tracker that can be used to track items passing through a stream.
 */
export function createTracker(): Operation<Tracker> {
  return resource(function* (provide) {
    const tracked = yield* createSetSignal();
    let count = 0;
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
                next() {
                  return scoped(function* () {
                    const next = yield* subscription.next();
                    tracked.add(next.value);
                    count++;
                    return next;
                  });
                },
              };
            },
          };
        };
      },
      get count() {
        return count;
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
