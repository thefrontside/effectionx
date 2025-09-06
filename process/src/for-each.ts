import { each, type Operation, type Stream } from "effection";

export function forEach<T, TClose>(
  fn: (chunk: T) => void,
  stream: Stream<T, TClose>,
): () => Operation<void> {
  return function* () {
    for (const chunk of yield* each(stream)) {
      fn(chunk);
      yield* each.next();
    }
  };
}
