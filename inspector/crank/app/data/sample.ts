import {
  action,
  all,
  scoped,
  spawn,
  withResolvers,
  type Operation,
  type Yielded,
} from "effection";
import type { Transform } from "./types.ts";

/**
 * Sample a stream at an interval specified by `interval`
 */
export function sample<T>(interval: Operation<unknown>): Transform<T, T> {
  return (stream) => {
    return {
      *[Symbol.iterator]() {
        let subscription = yield* stream;

        return {
          next() {
            return scoped(function* () {
              let next: Yielded<ReturnType<typeof subscription.next>>;
              let hasNext = withResolvers<void>();

              // spawn a task that will consume and drop frames
              yield* spawn(function* () {
                next = yield* subscription.next();
                hasNext.resolve();
                while (!next.done) {
                  next = yield* subscription.next();
                  console.log("drop", next);
                }
              });

              // we needf to await the interval AND have a next
              yield* all([interval, hasNext.operation]);
              console.log("next", next!);
              return next!;
            });
          },
        };
      },
    };
  };
}

export function raf(): Operation<number> {
  return action((resolve) => {
    let id = requestAnimationFrame(resolve);
    return () => {
      cancelAnimationFrame(id);
    };
  });
}
