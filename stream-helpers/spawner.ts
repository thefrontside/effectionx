import {
  type Stream,
  type Operation,
  type Result,
  scoped,
  Err,
  Ok,
} from "effection";

interface SpawnerOptions {
  spawn(op: unknown): Operation<unknown>;
}

export function spawner(options: SpawnerOptions) {
  return function <T, R>(stream: Stream<T, never>): Stream<Result<R>, never> {
    return {
      *[Symbol.iterator]() {
        const subscription = yield* stream;

        return {
          next() {
            return scoped(function* () {
              try {
                let next = yield* subscription.next();
                let result = yield* options.spawn(next.value);
                return {
                  done: false,
                  value: Ok(result as R),
                };
              } catch (e) {
                return {
                  done: false,
                  value: Err(e as Error),
                };
              }
            });
          },
        };
      },
    };
  };
}
