import { createSignal, type Operation, resource } from "effection";
import { useStateParent } from "./context.ts";
import type { NumberState } from "./types.ts";

export function number(initial: number = 0): Operation<NumberState> {
  return resource<NumberState>(function* (provide) {
    const signal = createSignal<number, number>();
    const parent = yield* useStateParent<number>();

    const ref = { current: parent.initial ?? initial };

    function* increment() {
      ref.current++;

      yield* parent.update(ref.current);
      signal.send(ref.current);

      return ref.current;
    }

    function* decrement() {
      ref.current--;

      yield* parent.update(ref.current);
      signal.send(ref.current);

      return ref.current;
    }

    function* set(value: number) {
      ref.current = value;

      yield* parent.update(ref.current);
      signal.send(ref.current);

      return ref.current;
    }

    const state: NumberState = {
      [Symbol.iterator]: signal[Symbol.iterator],
      increment,
      decrement,
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
