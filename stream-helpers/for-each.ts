import type { Operation, Stream } from "effection";

// export function filter<T>(
//   predicate: (value: T) => Operation<boolean>,
// ): <TDone>(stream: Stream<T, TDone>) => Stream<T, TDone> {

export function forEach<T, TClose>(
  fn: (item: T) => Operation<void>,
): (stream: Stream<T, TClose>) => Operation<TClose> {
  return function* (stream) {
    let subscription = yield* stream;
    let next = yield* subscription.next();
    while (!next.done) {
      yield* fn(next.value);
      next = yield* subscription.next();
    }
    return next.value;
  };
}