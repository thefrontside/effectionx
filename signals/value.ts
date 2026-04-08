import { createSignal, type Operation, resource } from "effection";

import type { ValueSignal } from "./types.ts";

export function createValueSignal<T>(initial: T): Operation<ValueSignal<T>> {
  return resource(function* (provide) {
    const signal = createSignal<T, void>();

    const ref = { current: initial };

    function set(value: T) {
      if (value !== ref.current) {
        ref.current = value;

        signal.send(ref.current);
      }

      return ref.current;
    }

    try {
      yield* provide({
        [Symbol.iterator]: signal[Symbol.iterator],
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
