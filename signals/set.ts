import { createSignal, type Operation, resource } from "effection";
import type { SettableValue } from "./types.ts";
import { Set } from "immutable";

interface SetSignal<T> extends SettableValue<Set<T>> {
  add(item: T): Set<T>;
  delete(item: T): boolean;
  difference(items: Iterable<T>): Set<T>;
  valueOf(): Set<T>;
}

/**
 * Creates a signal that represents a set.
 * @param initial - The initial value of the set.
 * @returns A signal that represents a set.
 */
export function createSetSignal<T>(
  initial: Array<T> = [],
): Operation<SetSignal<T>> {
  return resource(function* (provide) {
    const signal = createSignal<Set<T>, void>();

    const ref = { current: Set.of<T>(...initial) };

    try {
      yield* provide({
        [Symbol.iterator]: signal[Symbol.iterator],
        set(value) {
          ref.current = Set.of<T>(...value);
          signal.send(ref.current.toSet());
          return ref.current;
        },
        add(item) {
          ref.current = ref.current.add(item);
          signal.send(ref.current.toSet());
          return ref.current.toSet();
        },
        difference(items) {
          ref.current = ref.current.subtract(items);
          signal.send(ref.current.toSet());
          return ref.current.toSet();
        },
        delete(item) {
          if (ref.current.has(item)) {
            ref.current = ref.current.delete(item);
            signal.send(ref.current.toSet());
            return true;
          }
          return false;
        },
        valueOf() {
          return ref.current.toSet();
        },
      });
    } finally {
      signal.close();
    }
  });
}
