import {
  createSignal,
  each,
  type Operation,
  resource,
  type Stream,
} from "effection";

interface Boolean extends Stream<boolean, boolean> {
  set(value: boolean): boolean;
  is(value: boolean): Operation<boolean>;
  value: boolean;
}

export function createBoolean(initial: boolean = false) {
  return resource<Boolean>(function* (provide) {
    const signal = createSignal<boolean, boolean>();

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
        *is(value: boolean) {
          if (ref.current === value) {
            return true;
          }
          for (const value of yield* each(signal)) {
            if (value === ref.current) {
              return ref.current;
            }
            yield* each.next();
          }
          return false;
        },
        get value() {
          return ref.current;
        },
      });
    } finally {
      signal.close(ref.current);
    }
  });
}
