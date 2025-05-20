import { createSignal, type Operation, resource } from "effection";

import type { ValueSignal } from "./types.ts";

export interface BooleanSignal extends ValueSignal<boolean> {}

export function createBooleanSignal(
  initial: boolean = false,
): Operation<BooleanSignal> {
  return resource(function* (provide) {
    const signal = createSignal<boolean, void>();

    const ref = { current: initial };

    function set(value: boolean) {
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
