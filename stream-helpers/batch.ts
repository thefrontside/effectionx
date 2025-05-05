import {
  race,
  scoped,
  sleep,
  spawn,
  type Stream,
  withResolvers,
} from "effection";

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
 * Batch a stream by time or size.
 *
 * @param options - The options for the batch.
 * @param options.maxTime - The maximum time to wait for a batch.
 * @param options.maxSize - The maximum size of a batch.
 */
export function batch(
  options: RequireAtLeastOne<BatchOptions>,
): <T>(stream: Stream<T, never>) => Stream<T[], never> {
  return function <T>(stream: Stream<T, never>): Stream<T[], never> {
    return {
      *[Symbol.iterator]() {
        const subscription = yield* stream;

        return {
          next() {
            return scoped(function* () {
              const full = withResolvers<void>();

              const batch: T[] = [];

              yield* spawn(function* () {
                let count = 0;
                while (true) {
                  let next = yield* subscription.next();
                  batch.push(next.value);
                  count++;
                  if (count >= (options.maxSize ?? Infinity)) {
                    full.resolve();
                    break;
                  }
                }
              });

              yield* race([sleep(options.maxTime ?? Infinity), full.operation]);

              return {
                done: false,
                value: batch,
              };
            });
          },
        };
      },
    };
  };
}
