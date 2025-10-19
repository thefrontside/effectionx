import {
  spawn,
  type Task,
  type Stream,
  Operation,
  WithResolvers,
  withResolvers,
  lift,
} from "effection";
import { timebox } from "@effectionx/timebox";

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> = Pick<
  T,
  Exclude<keyof T, Keys>
> &
  {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export interface BatchOptions {
  readonly maxTime: number;
  readonly maxSize: number;
}

/**
 * Creates batches of items from the source stream. The batches can be created either by
 * specifying a maximum time or a maximum size. If both are specified, the batch will be
 * created when either condition is met.
 *
 * @param options - The options for the batch.
 * @param options.maxTime - The maximum time to wait for a batch.
 * @param options.maxSize - The maximum size of a batch.
 * @returns A stream of arrays of items from the source stream.
 */
export function batch(
  options: RequireAtLeastOne<BatchOptions>,
): <T>(stream: Stream<T, never>) => Stream<Readonly<T[]>, never> {
  return function <T>(stream: Stream<T, never>): Stream<Readonly<T[]>, never> {
    return {
      *[Symbol.iterator]() {
        const subscription = yield* stream;
        let lastPull: Task<IteratorResult<T, never>> | undefined;

        return {
          *next() {
            let start: DOMHighResTimeStamp = performance.now();
            const batch: T[] = [];
            if (lastPull) {
              batch.push((yield* lastPull).value);
              lastPull = undefined;
            }
            // iterate incoming stream
            let next = yield* subscription.next();
            // push the next value into the batch
            while (!next.done) {
              batch.push(next.value);
              const now = performance.now();
              if (options.maxSize && batch.length >= options.maxSize) {
                return {
                  done: false as const,
                  value: batch,
                };
              } else if (options.maxTime && start + options.maxTime <= now) {
                return {
                  done: false as const,
                  value: batch,
                };
              } else if (options.maxTime) {
                lastPull = yield* spawn(function* () {
                  const next = yield* subscription.next();
                  return next;
                });

                const timeout = yield* timebox(
                  start + options.maxTime - performance.now(),
                  () =>
                    lastPull!,
                );

                if (timeout.timeout) {
                  // produce the batch that we have
                  return {
                    done: false as const,
                    value: batch,
                  };
                } else {
                  lastPull = undefined;
                  next = timeout.value;
                }
              } else {
                next = yield* subscription.next();
              }
            }

            // Stream is done, return any remaining batch
            if (batch.length > 0) {
              return {
                done: false as const,
                value: batch,
              };
            }

            return {
              done: true as const,
              value: undefined as never,
            };
          },
        };
      },
    };
  };
}
