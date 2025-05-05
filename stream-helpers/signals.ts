import {
  createSignal,
  each,
  type Operation,
  resource,
  type Stream,
} from "effection";
import { List } from "immutable";

interface ArraySignal<T> extends Stream<T[], void> {
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
  array: ArraySignal<T>,
  predicate: (item: T[]) => boolean,
) {
  if (predicate(array.valueOf())) {
    return;
  }
  for (const value of yield* each(array)) {
    if (predicate(value)) {
      return;
    }
    yield* each.next();
  }
}
