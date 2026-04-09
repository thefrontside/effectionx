import { type Operation, resource } from "effection";

import { is } from "./helpers.ts";
import type { ValueSignal } from "./types.ts";
import { createValueSignal } from "./value.ts";

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
  push(...args: T[]): number;
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
    const signal = yield* createValueSignal(snapshotArray(initial), {
      equals: areArraysEqual,
    });

    function set(value: Iterable<T>): T[] {
      return signal.set(snapshotArray(value)).slice();
    }

    const array: ArraySignal<T> = {
      [Symbol.iterator]: signal[Symbol.iterator],
      set,
      update(updater) {
        return set(updater(signal.valueOf().slice()));
      },
      push(...args: T[]) {
        return signal.set(snapshotArray([...signal.valueOf(), ...args])).length;
      },
      *shift() {
        yield* is(array, (array) => array.length > 0);
        const [value, ...rest] = signal.valueOf();
        signal.set(snapshotArray(rest));
        return value!;
      },
      valueOf() {
        return signal.valueOf().slice();
      },
      get length() {
        return signal.valueOf().length;
      },
    };

    yield* provide(array);
  });
}

function snapshotArray<T>(value: Iterable<T>): T[] {
  return Object.freeze([...value]) as T[];
}

function areArraysEqual<T>(current: readonly T[], next: readonly T[]): boolean {
  return (
    current.length === next.length &&
    current.every((value, index) => Object.is(value, next[index]))
  );
}
