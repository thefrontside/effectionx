import { each, race, sleep, spawn, type Stream } from "effection";
import { createArraySignal, is } from "./signals.ts";

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
  & Pick<T, Exclude<keyof T, Keys>>
  & {
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
): <T>(stream: Stream<T, never>) => Stream<T[], never> {
  return function <T>(stream: Stream<T, never>): Stream<T[], never> {
    return {
      *[Symbol.iterator]() {
        let batch = yield* createArraySignal<T>([]);

        yield* spawn(function* () {
          for (let item of yield* each(stream)) {
            batch.push(item);
            if (options.maxSize && batch.length >= options.maxSize) {
              // wait until it's drained
              yield* is(batch, (batch) => batch.length === 0);
            }
            yield* each.next();
          }
        });

        function drain() {
          let value = batch.valueOf();
          batch.set([]);
          return value;
        }

        return {
          *next() {
            yield* is(batch, (batch) => batch.length >= 1);

            if (options.maxTime && options.maxSize) {
              yield* race([
                is(batch, (batch) => batch.length === options.maxSize),
                sleep(options.maxTime),
              ]);
            } else if (options.maxTime) {
              yield* sleep(options.maxTime);
            } else if (options.maxSize) {
              yield* is(batch, (batch) => batch.length === options.maxSize);
            }

            return { done: false, value: drain() };
          },
        };
      },
    };
  };
}
