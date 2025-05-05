import { type Operation, scoped, spawn, type Stream } from "effection";
import { createArraySignal } from "./signals.ts";

export interface ValveOptions {
  openAt: number;
  closeAt: number;
  open(): Operation<void>;
  close(): Operation<void>;
}

export function valve(
  options: ValveOptions,
): <T>(stream: Stream<T, never>) => Stream<T, never> {
  return function <T>(stream: Stream<T, never>): Stream<T, never> {
    return {
      *[Symbol.iterator]() {
        const subscription = yield* stream;

        const buffer = yield* createArraySignal<T>([]);
        let open = true;

        yield* spawn(function* () {
          while (true) {
            let next = yield* subscription.next();
            if (open && (buffer.length + 1) >= options.closeAt) {
              yield* options.close();
              open = false;
            } else if (!open && (buffer.length + 1) <= options.openAt) {
              yield* options.open();
              open = true;
            }
            buffer.push(next.value);
          }
        });

        return {
          next() {
            return scoped(function* () {
              const value = yield* buffer.shift();
              if (!open && buffer.length <= options.openAt) {
                yield* options.open();
                open = true;
              }
              return {
                done: false,
                value,
              };
            });
          },
        };
      },
    };
  };
}
