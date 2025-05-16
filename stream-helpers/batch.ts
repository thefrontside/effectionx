import { race, type Stream, scoped, spawn, withResolvers, sleep, type Operation } from "effection";
import { createArraySignal, is } from "./signals.ts";

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  & Pick<T, Exclude<keyof T, Keys>>
  & {
    [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>;
  }[Keys];

export interface BatchOptions {
  maxTime: number;
  maxSize: number;
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
): <T>(stream: Stream<T, never>) => Stream<T[], never> {
  return function <T>(stream: Stream<T, never>): Stream<T[], never> {
    return {
      *[Symbol.iterator]() {
        const subscription = yield* stream;

        return {
          next: () =>
            scoped(function* () {
              let batch = yield* createArraySignal<T>([]);
              let { resolve, operation: filled } = withResolvers<void>();
              
              // pump the subscription into the batch
              yield* spawn(function* () {
                let next = yield* subscription.next();
                while (!next.done) {
                  batch.push(next.value);
                  if (options.maxSize && batch.length >= options.maxSize) {
                    resolve();
                    break;
                  }
                  next = yield* subscription.next();
                }
              });
    
              yield* is(batch, (batch) => batch.length >= 1);

              if (options.maxTime) {
                yield* race([filled, sleep(options.maxTime)]);

                return { done: false, value: batch.valueOf() };
              }
              
              if (options.maxSize) {
                yield* filled;
                return { done: false, value: batch.valueOf() };
              }

              return { done: false, value: batch.valueOf() };
            }),
        };
      }
    }
  }
}

function first<T, TClose>(
  stream: Stream<T, TClose>,
): Operation<T | undefined> {
  return scoped(function*() {
    let subscription = yield* stream;
    let next = yield* subscription.next();
    return next.done ? undefined : next.value;
  });
}