import type { Stream, Subscription } from "effection";

/**
 * Converts any stream into a multicast stream that produces latest value
 * to new subscribers. It's designed to be analagous in function to [RxJS
 * BehaviorSubject](https://www.learnrxjs.io/learn-rxjs/subjects/behaviorsubject).
 *
 * @returns A function that takes a stream and returns a multicast stream
 *
 * @example
 * ```ts
 * const subject = createSubject<number>();
 * const downstream = subject(upstream);
 *
 * const sub1 = yield* downstream; // subscribes to upstream
 * yield* upstream.send(1);
 * yield* sub1.next(); // { done: false, value: 1 }
 *
 * const sub2 = yield* downstream; // late subscriber
 * yield* sub2.next(); // { done: false, value: 1 } - gets latest value
 * ```
 *
 * Use it with a pipe operator to convert any stream into a behavior subject.
 *
 * @example
 * ```
 * let source = createChannel<string, void>();
 * let subject = createSubject<string>();
 *
 * let pipeline = pipe([
 *  top,
 *  transform1,
 *  transform2,
 *  subject,
 * ]);
 * ```
 */
export function createSubject<T>(
  initial?: T,
): <TClose>(stream: Stream<T, TClose>) => Stream<T, TClose> {
  let current: IteratorResult<T> | undefined =
    typeof initial !== "undefined"
      ? { done: false, value: initial }
      : undefined;

  return <TClose>(stream: Stream<T, TClose>) => ({
    *[Symbol.iterator]() {
      let upstream = yield* stream;

      let iterator: Subscription<T, TClose> = current
        ? {
            *next() {
              iterator = upstream;
              // biome-ignore lint/style/noNonNullAssertion: current checked in ternary condition
              return current!;
            },
          }
        : {
            *next() {
              current = yield* upstream.next();
              return current;
            },
          };

      return {
        next: () => iterator.next(),
      };
    },
  });
}
