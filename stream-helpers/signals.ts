import {
  createSignal,
  type Operation,
  resource,
  type Stream,
  each
} from "effection";
import { List } from "immutable";

interface ValueStream<T> extends Stream<T, void> {
  valueOf(): T;
}

interface ArraySignal<T> extends ValueStream<T[]> {
  push(item: T): number;
  shift(): Operation<T>;
  valueOf(): T[];
  get length(): number;
}

export function createArraySignal<T>(
  initial: Iterable<T>,
): Operation<ArraySignal<T>> {
  return resource(function* (provide) {
    const signal = createSignal<T[], void>();
    const ref = {
      current: List.of<T>(...initial),
    };

    const array: ArraySignal<T> = {
      [Symbol.iterator]: signal[Symbol.iterator],
      push(item) {
        ref.current = ref.current.push(item);
        signal.send(ref.current.toArray());
        return ref.current.size;
      },
      *shift() {
        yield* is(array, (array) => array.length > 0);
        let value = ref.current.first();
        ref.current = ref.current.shift();
        signal.send(ref.current.toArray());
        return value!;
      },
      valueOf() {
        return ref.current.toArray();
      },
      get length() {
        return ref.current.size;
      },
    };

    try {
      yield* provide(array);
    } finally {
      signal.close();
    }
  });
}

export function* is<T>(
  array: ValueStream<T>,
  predicate: (item: T) => boolean,
) {
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
