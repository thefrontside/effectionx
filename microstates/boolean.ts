import { createSignal, type Operation, resource } from "effection";
import { useStateParent } from "./context.ts";
import type { BooleanState } from "./types.ts";

export function boolean(initial: boolean = false): Operation<BooleanState> {
  return resource<BooleanState>(function* (provide) {
    const signal = createSignal<boolean, boolean>();
    const parent = yield* useStateParent<boolean>();

    const ref = { current: parent.initial ?? initial };

    function* toggle() {
      ref.current = !ref.current;

      yield* parent.update(ref.current);
      signal.send(ref.current);

      return ref.current;
    }

    function* set(value: boolean) {
      ref.current = value;

      yield* parent.update(ref.current);
      signal.send(ref.current);

      return ref.current;
    }

    const state: BooleanState = {
      [Symbol.iterator]: signal[Symbol.iterator],
      toggle,
      set,
      get value() {
        return ref.current;
      },
    };

    try {
      yield* provide(state);
    } finally {
      signal.close(ref.current);
    }
  });
}
