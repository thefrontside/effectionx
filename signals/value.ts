import { createSignal, type Operation, resource } from "effection";

import type { ValueSignal } from "./types.ts";

/**
 * Configuration for {@link createValueSignal}.
 */
export interface CreateValueSignalOptions<T> {
  /**
   * Returns `true` when two values should be treated as unchanged.
   *
   * Defaults to `Object.is`.
   */
  equals?: (current: T, next: T) => boolean;

  /**
   * Replays the current value to subscribers when they attach.
   *
   * This is disabled by default.
   */
  emitCurrentOnSubscribe?: boolean;
}

/**
 * Creates a value-backed signal with configurable equality semantics.
 *
 * @param initial - Initial signal value.
 * @param options - Equality and subscription behavior overrides.
 * @returns A value signal resource.
 */
export function createValueSignal<T>(
  initial: T,
  options: CreateValueSignalOptions<T> = {},
): Operation<ValueSignal<T>> {
  return resource(function* (provide) {
    const signal = createSignal<T, void>();
    const equals = options.equals ?? Object.is;

    const ref = { current: initial };

    function set(value: T): T {
      if (!equals(ref.current, value)) {
        ref.current = value;

        signal.send(ref.current);
      }

      return ref.current;
    }

    try {
      yield* provide({
        [Symbol.iterator]: options.emitCurrentOnSubscribe
          ? function* () {
              const subscription = yield* signal;
              signal.send(ref.current);
              return subscription;
            }
          : signal[Symbol.iterator],
        set,
        update(updater) {
          return set(updater(ref.current));
        },
        valueOf() {
          return ref.current;
        },
      });
    } finally {
      signal.close();
    }
  });
}
