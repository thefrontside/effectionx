import {
  createQueue,
  createSignal,
  resource,
  SignalQueueFactory,
  spawn,
  type Operation,
  type Stream,
  type Subscription,
} from "effection";

/**
 * Converts any stream into a multicast stream that replays the latest value
 * to new subscribers. Analogous to
 * [RxJS BehaviorSubject](https://www.learnrxjs.io/learn-rxjs/subjects/behaviorsubject).
 *
 * Applying the subject to a stream returns a resource. Yielding that resource
 * starts an internal drain that actively tracks the upstream, so late
 * subscribers always receive the most recent value — even if no other
 * subscriber has pulled it.
 *
 * @returns A function that takes a stream and returns a resource providing
 *   a multicast stream.
 *
 * @example
 * ```ts
 * const subject = createSubject<number>();
 * const downstream = yield* subject(upstream);
 *
 * const sub1 = yield* downstream; // subscribes
 * yield* upstream.send(1);
 * yield* sub1.next(); // { done: false, value: 1 }
 *
 * const sub2 = yield* downstream; // late subscriber
 * yield* sub2.next(); // { done: false, value: 1 } — gets latest value
 * ```
 */
export function createSubject<T>(
  initial?: T,
): <TClose>(stream: Stream<T, TClose>) => Operation<Stream<T, TClose>> {
  let current: IteratorResult<T> | undefined =
    typeof initial !== "undefined"
      ? { done: false, value: initial }
      : undefined;

  return <TClose>(stream: Stream<T, TClose>) =>
    resource<Stream<T, TClose>>(function* (provide) {
      const relay = createSignal<T, TClose>();
      let closed = false;

      // Install a custom queue that updates `current` synchronously
      // when values arrive — before the drain task gets scheduled.
      // This guarantees late subscribers always see the latest value
      // even when signal.send() is called within a running operation.
      yield* SignalQueueFactory.set(<U, UClose = never>() => {
        const queue = createQueue<U, UClose>();
        return {
          ...queue,
          add(value: U) {
            current = { done: false, value: value as unknown as T };
            queue.add(value);
          },
          close(value: UClose) {
            current = { done: true, value } as unknown as IteratorResult<T>;
            closed = true;
            queue.close(value);
          },
        };
      });

      // Subscribe to upstream eagerly so its queue starts buffering
      // before provide() hands back control to callers.
      const upstream = yield* stream;

      // Drain owns the read loop that multicasts values to relay subscribers.
      // Lives in the resource scope — outlives any individual subscriber.
      yield* spawn(function* () {
        let result = yield* upstream.next();
        while (!result.done) {
          relay.send(result.value);
          result = yield* upstream.next();
        }
        relay.close(result.value);
      });

      yield* provide({
        *[Symbol.iterator]() {
          // Post-close: Effection signals are stateless — subscribing after
          // relay.close() would hang. Return captured close result directly.
          if (closed && current) {
            let snapshot = current;
            return {
              *next() {
                return snapshot as IteratorResult<T, TClose>;
              },
            };
          }

          let subscription: Subscription<T, TClose> = yield* relay;
          let snapshot = current;
          let replayed = !snapshot;

          return {
            *next() {
              if (!replayed) {
                replayed = true;
                return snapshot! as IteratorResult<T, TClose>;
              }
              return yield* subscription.next();
            },
          };
        },
      });
    });
}
