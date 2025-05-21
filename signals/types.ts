import type { Stream } from "effection";

/**
 * A signal is a stream with set, update, and valueOf methods.
 * Subscribing to a signal will yield the current value of the signal.
 */
export interface ValueSignal<T> extends Stream<T, void> {
  /**
   * Set the value of the signal.
   * @param value - The value to set the signal to.
   * @returns The value of the signal.
   */
  set(value: T): T;
  /**
   * Update the value of the signal.
   * @param updater - The updater function.
   * @returns The value of the signal.
   */
  update(updater: (value: T) => T): T;
  /**
   * Get the current value of the signal.
   * @returns The current value of the signal.
   */
  valueOf(): T;
}
