import { createSignal, type Operation, resource } from "effection";
import type { SettableValue } from "./types.ts";
import { Set, is } from "immutable";

/**
 * A signal that represents a Set.
 */
interface SetSignal<T> extends SettableValue<Set<T>> {
  /**
   * Adds an item to the Set.
   * @param item - The item to add to the Set.
   * @returns The Set.
   */
  add(item: T): Set<T>;
  /**
   * Removes an item from the Set.
   * @param item - The item to remove from the Set.
   * @returns `true` if the item was removed, `false` otherwise.
   */
  delete(item: T): boolean;
  /**
   * Returns a new Set with the items that are in the current Set but not in the given iterable.
   * @param items - The items to remove from the Set.
   * @returns A new Set with the items that are in the current Set but not in the given iterable.
   */
  difference(items: Iterable<T>): Set<T>;
  /**
   * Returns the Set value
   * @returns The Set.
   */
  valueOf(): Set<T>;
}

/**
 * Creates a signal that represents a set. Adding and removing items from the set will
 * push a new value through the stream.
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
          if (is(ref.current, value)) {
            return ref.current;
          }
          ref.current = value;
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
