import { spawn, race, scoped, sleep, type Stream, withResolvers } from "effection";

type RequireAtLeastOne<T, Keys extends keyof T = keyof T> =
    Pick<T, Exclude<keyof T, Keys>> 
    & {
        [K in Keys]-?: Required<Pick<T, K>> & Partial<Pick<T, Exclude<Keys, K>>>
    }[Keys]

export interface BatchOptions {
  maxTime: number;
  maxSize: number;
}

export function batch(options: RequireAtLeastOne<BatchOptions>) {
  return function <T>(stream: Stream<T, never>): Stream<T[], never> {
    return {
      *[Symbol.iterator]() {
        const subscription = yield* stream;

        return {
          next() {
            return scoped(function* () {
              let next = yield* subscription.next();
              const full = withResolvers<void>();

              const batch: T[] = [next.value];

              yield* spawn(function* () {
                let count = 1;
                while (true) {
                  next = yield* subscription.next();
                  batch.push(next.value);
                  count++;
                  if (count >= (options.maxSize ?? Infinity)) {
                    full.resolve();
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
