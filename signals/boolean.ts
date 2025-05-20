import { createSignal, type Operation, resource } from "effection";

import type { SettableValue } from "./types.ts";

export interface BooleanSignal extends SettableValue<boolean> {}

export function createBooleanSignal(
  initial: boolean = false,
): Operation<BooleanSignal> {
  return resource(function* (provide) {
    const signal = createSignal<boolean, void>();

    const ref = { current: initial };

    try {
      yield* provide({
        [Symbol.iterator]: signal[Symbol.iterator],
        set(value) {
          if (value !== ref.current) {
            ref.current = value;

            signal.send(ref.current);
          }

          return ref.current;
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
