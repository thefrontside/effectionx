import { type Operation, scoped, spawn, type Stream } from "effection";
import { createArraySignal } from "./signals.ts";

export interface ValveOptions {
  openAt: number;
  closeAt: number;
  open(): Operation<void>;
  close(): Operation<void>;
}

/**
 * Allows to apply backpressure to the source of the stream. This is useful when the
 * source generates items faster than the consumer can consume them and the source
 * provides a way to pause and resume the stream. It was originally designed for use
 * with Kafka where the producer can overwhelm the consumer with messages causing the
 * consumer to run out of memory.
 *
 * This function buffers incoming items, if the upstream is producing faster than the downstream
 * can consume, the buffer will grow. If the buffer size exceeds the `closeAt` threshold, the
 * `close` operation will be called which is expected to pause the upstream. The buffer will
 * drain until the buffer size is less than the `openAt` threshold, at which point the `open`
 * operation will be called to resume the upstream.
 *
 * @param options.open - The operation to resume the upstream.
 * @param options.openAt - The buffer size at which the upstream will be resumed.
 * @param options.close - The operation to pause the upstream.
 * @param options.closeAt - The buffer size at which the upstream will be paused.
 * @returns A stream with backpressure applied.
 */
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
