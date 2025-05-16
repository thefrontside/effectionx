import {
call,
  race,
  scoped,
  sleep,
  spawn,
  type Stream,
  withResolvers,
  each,
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
          *next() {
            const start = Date.now();
            const batch: T[] = [];
            let next = yield* subscription.next();
            
            while (true) {
              batch.push(next.value);

              if (options.maxTime && (Date.now() - start) >= options.maxTime) {
                return {
                  done: false,
                  value: batch
                }
              }
              if (options.maxSize && batch.length >= options.maxSize) {
                return {
                  done: false,
                  value: batch
                }
              }

              next = yield* subscription.next();
            }
          },
        };
      },
    };
  };
}

// return scoped(function* () {
              // const one = withResolvers<T[]>();
              // const full = withResolvers<T[]>();

              // const batch: T[] = [];

              // yield* spawn(function* () {
              //   let count = 0;
              //   while (true) {
              //     let next = yield* subscription.next();
              //     console.log({ next });
              //     batch.push(next.value);
              //     one.resolve(batch);
              //     // console.log({ value: next.value, batch });
              //     count++;
              //     if (count >= (options.maxSize ?? Infinity)) {
              //       full.resolve(batch);
              //       break;
              //     }
              //   }
              // });

              // if (options.maxTime) {
              //   const result = yield* race([call(function*() {
              //     if (options.maxTime) {
              //       yield* sleep(options.maxTime);
              //     }
              //     yield* one.operation
              //     return batch;
              //   }), full.operation]);
              //   // console.log({ maxTime: options.maxTime, result });
              //   return {
              //     done: false,
              //     value: result,
              //   }
              // }

              // const result = yield* full.operation;
              // console.log({ maxTime: options.maxTime, result });

              // return {
              //   done: false,
              //   value: result,
              // }
            // });