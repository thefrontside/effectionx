import { each, type Operation } from "effection";
import type { ValueStream } from "./types.ts";

export function* is<T>(
  array: ValueStream<T>,
  predicate: (item: T) => boolean,
): Operation<void> {
  const result = predicate(array.valueOf());
  if (result) {
    return;
  }
  for (const value of yield* each(array)) {
    const result = predicate(value);
    if (result) {
      return;
    }
    yield* each.next();
  }
}
