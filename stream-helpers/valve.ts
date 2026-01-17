import { each, type Operation, spawn, type Stream } from "effection";
import { createArraySignal } from "@effectionx/signals";

/**
 * Options for the valve.
 */
export interface ValveOptions {
  /**
   * The buffer size when {@link ValveOptions#open} method is called.
   */
  openAt: number;
  /**
   * The buffer size when {@link ValveOptions#close} method is called.
   */
  closeAt: number;
  /**
   * The operation to resume the upstream.
   */
  open(): Operation<void>;
  /**
   * The operation to pause the upstream.
   */
  close(): Operation<void>;
}

/**
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
  return <T>(stream: Stream<T, never>): Stream<T, never> => ({
      *[Symbol.iterator]() {
        const buffer = yield* createArraySignal<T>([]);
        let open = true;

        yield* spawn(function* () {
          for (const item of yield* each(stream)) {
            buffer.push(item);
            if (open && buffer.length >= options.closeAt) {
              yield* options.close();
              open = false;
            }
            yield* each.next();
          }
        });

        return {
          *next() {
            if (!open && buffer.length <= options.openAt) {
              yield* options.open();
              open = true;
            }
            const value = yield* buffer.shift();
            return {
              done: false,
              value,
            };
          },
        };
      },
    });
}
