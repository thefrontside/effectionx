import { type Operation, spawn, scoped, type Stream } from "effection";
import { createListState } from "./microstates.ts";

export interface ValveOptions {
  openAt: number;
  closeAt: number;
  open(): Operation<void>;
  close(): Operation<void>;
}

export function valve(options: ValveOptions) {
  return function <T>(stream: Stream<T, never>): Stream<T, never> {
    return {
      *[Symbol.iterator]() {
        const subscription = yield* stream;

        const buffer = yield* createListState<T>([]);
        let open = true;

        yield* spawn(function* () {
          while (true) {
            let next = yield* subscription.next();
            buffer.push(next.value);
            if (open && buffer.size >= options.closeAt) {
              yield* options.close();
              open = false;
            } else if (!open && buffer.size <= options.openAt) {
              yield* options.open();
              open = true;
            }
          }
        });

        return {
          next() {
            return scoped(function* () {
              if (buffer.size > 0) {
                let value = buffer.first() as T;
                buffer.shift();
                return {
                  done: false,
                  value,
                };
              }

              const subscription = yield* buffer;
              while (true) {
                let next = yield* subscription.next();
                if (next.value && next.value.size > 0) {
                  let value = buffer.first() as T;
                  buffer.shift();
                  return {
                    done: false,
                    value,
                  };
                }
              }
            });
          },
        };
      },
    };
  };
}
