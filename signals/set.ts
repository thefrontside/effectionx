import { type Operation, resource } from "effection";
import { is, Set } from "immutable";
import type { ValueSignal } from "./types.ts";
import { createValueSignal } from "./value.ts";

/**
 * A signal that represents a Set.
 */
export interface SetSignal<T> extends ValueSignal<Set<T>> {
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
    const signal = yield* createValueSignal(Set.of<T>(...initial), {
      equals: is,
    });

    function set(value: Iterable<T>): Set<T> {
      return signal.set(Set.of<T>(...value));
    }

    yield* provide({
      [Symbol.iterator]: signal[Symbol.iterator],
      set,
      update(updater) {
        return set(updater(signal.valueOf().toSet()));
      },
      add(item) {
        return signal.set(signal.valueOf().add(item));
      },
      difference(items) {
        return signal.set(signal.valueOf().subtract(items));
      },
      delete(item) {
        if (signal.valueOf().has(item)) {
          signal.set(signal.valueOf().delete(item));
          return true;
        }
        return false;
      },
      valueOf() {
        return signal.valueOf().toSet();
      },
    });
  });
}
