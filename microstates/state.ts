import { createSignal, type Operation, resource } from "effection";

import { StateParentContext, useStateParent } from "./context.ts";
import type {
  ComposedState,
  Initial,
  ParentContextValue,
  States,
} from "./types.ts";

export function state<
  T extends { [K: string]: Operation<States> },
  I extends Initial<T>,
>(type: T, initialValue?: I): Operation<ComposedState<T>> {
  return resource<ComposedState<T>>(function* (provide) {
    const signal = createSignal<I>();
    const parent = yield* useStateParent();
    const ref = { current: parent.initial ?? initialValue ?? {} };

    const result = {
      [Symbol.iterator]: signal[Symbol.iterator],
      get value() {
        return ref.current;
      },
    } as ComposedState<T>;

    for (const [key, constructor] of Object.entries(type)) {
      const initial = initialValue ? initialValue[key] : undefined;

      const update: ParentContextValue<unknown>["update"] = function* update(
        value,
      ) {
        (ref.current as Record<string, unknown>)[key] = value;
        yield* parent.update(ref.current);
        signal.send(ref.current as I);
      };

      const stream = yield* StateParentContext.with(
        {
          update,
          initial,
        },
        () => constructor,
      );

      // set initial value
      (ref.current as Record<string, unknown>)[key] = stream.value;

      Object.defineProperties(result, {
        [key]: {
          value: stream,
          enumerable: true,
          configurable: false,
          writable: false,
        },
      });
    }

    yield* provide(result);
  });
}
