import { createSignal, type Operation, resource } from "effection";
import { List } from "immutable";

import { is } from "./helpers.ts";
import type { SettableValue } from "./types.ts";

interface ArraySignal<T> extends SettableValue<T[]> {
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
      set(value) {
        ref.current = List.of<T>(...value);
        signal.send(ref.current.toArray());
        return ref.current.toArray();
      },
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
