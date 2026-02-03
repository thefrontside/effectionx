import { lift, type Operation, type Stream } from "effection";

export function fn<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => TReturn,
): (...args: TArgs) => Stream<never, TReturn> {
  return lift((...args) => ({
    *next() {
      return { done: true, value: fn(...args) };
    },
  }));
}

export function op<TArgs extends unknown[], TReturn>(
  fn: (...args: TArgs) => Operation<TReturn>,
): (
  ...args: TArgs
) => Stream<never, TReturn extends void ? undefined : TReturn> {
  return lift((...args) => ({
    *next() {
      return {
        done: true,
        value: yield* fn(...args),
      } as IteratorReturnResult<TReturn extends void ? undefined : TReturn>;
    },
  }));
}
