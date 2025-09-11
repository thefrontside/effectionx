import type { Operation, Stream } from "effection";

export function forEach<T, TClose>(
  fn: (chunk: T) => Operation<void>,
  stream: Stream<T, TClose>,
): () => Operation<TClose> {
  return function* () {
    let subscription = yield* stream;
    let next = yield* subscription.next();
    while (!next.done) {
      yield* fn(next.value);
      next = yield* subscription.next();
    }
    return next.value;
  };
}
