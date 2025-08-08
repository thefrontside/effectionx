import { createSignal, type Operation, resource } from "effection";
import { List } from "immutable";

import { is } from "./helpers.ts";
import type { ValueSignal } from "./types.ts";

/**
 * Interface for return value of {@link createArraySignal}.
 */
export interface ArraySignal<T> extends ValueSignal<T[]> {
  /**
   * Pushes a new value onto the end of the array.
   *
   * @param item - The value to push onto the array.
   * @returns The new length of the array.
   */
  push(item: T): number;
  /**
   * Removes the first value from the array and returns it.
   * If the array is empty, the operation will block until a value is available.
   *
   * @returns The first value from the array.
   */
  shift(): Operation<T>;
  /**
   * Returns the current value of the array.
   *
   * @returns The current value of the array.
   */
  valueOf(): Readonly<T[]>;
  /**
   * Returns the length of the array.
   *
   * @returns The length of the array.
   */
  get length(): number;
}

/**
 * A signal for an immutable array value. The stream emits the
 * current value of the array and new values when the array is updated. The array
 * is immutable and cannot be changed. Instead, the value is replaced with a new
 * value.
 *
 * @param initial - The initial value of the signal.
 * @returns A stream of immutable array values.
 */
export function createArraySignal<T>(
  initial: Iterable<T>,
): Operation<ArraySignal<T>> {
  return resource(function* (provide) {
    const signal = createSignal<T[], void>();
    const ref = {
      current: List.of<T>(...initial),
    };

    function set(value: Iterable<T>) {
      if (ref.current.equals(List.of<T>(...value))) {
        return ref.current.toArray();
      }

      ref.current = List.of<T>(...value);
      signal.send(ref.current.toArray());
      return ref.current.toArray();
    }

    const array: ArraySignal<T> = {
      [Symbol.iterator]: signal[Symbol.iterator],
      set,
      update(updater) {
        return set(updater(ref.current.toArray()));
      },
      push(...args: T[]) {
        ref.current = ref.current.push(...args);
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
