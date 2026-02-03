import { createBooleanSignal, is } from "@effectionx/signals";
import { type Operation, type Stream, createChannel } from "effection";

/**
 * Interface of the stream returned by `useFaucet`.
 */
export interface Faucet<T> extends Stream<T, never> {
  /**
   * Pour items to the stream synchronously.
   * @param items - The items to pour to the stream.
   */
  pour(items: T[]): Operation<void>;
  /**
   * Pour items to the stream using an operation that can be asynchronous.
   * @param op - The generator function to pour items to the stream.
   */
  pour(
    op: (send: (item: T) => Operation<void>) => Operation<void>,
  ): Operation<void>;
  /**
   * Open the stream to allow items to be sent to the stream.
   */
  open(): void;
  /**
   * Close the stream to prevent items from being sent to the stream.
   */
  close(): void;
}

/**
 * Options for the faucet.
 */
export interface FaucetOptions {
  /**
   * Whether the faucet is open when created.
   */
  open?: boolean;
}

/**
 * Creates a stream that can be used to test the behavior of streams that use backpressure.
 * It's useful in tests where it can be used as a source stream. This function is used to create
 * the stream.
 *
 * The returned stream has `pour` method that can be used to send items to the stream.
 * It can accept an array of items or a generator function that will be called with a function
 * to send items to the stream.
 *
 * ```typescript
 * import { useFaucet } from "@effectionx/stream-helpers/test-helpers";
 * import { run, each, spawn } from "effection";
 *
 * await run(function* () {
 *   const faucet = yield* useFaucet({ open: true });
 *
 *   // Remember to spawn the stream subscription before sending items to the stream
 *   yield* spawn(function* () {
 *     for (let i of yield* each(faucet)) {
 *       console.log(i);
 *       yield* each.next();
 *     }
 *   });
 *
 *   // Pass an array of items to send items to the stream one at a time synchronously
 *   yield* faucet.pour([1, 2, 3]);
 *
 *   // Pass an operation to control the rate at which items are sent to the stream
 *   yield* faucet.pour(function* (send) {
 *     yield* sleep(10);
 *     send(5);
 *     yield* sleep(30);
 *     send(6);
 *     yield* sleep(10);
 *     send(7);
 *   });
 * });
 *
 * ```
 * @param options - The options for the faucet.
 * @param options.open - Whether the faucet is open.
 * @returns stream of items coming from the faucet
 */
export function useFaucet<T>(options: FaucetOptions): Operation<Faucet<T>> {
  return {
    *[Symbol.iterator]() {
      let signal = createChannel<T, never>();
      let open = yield* createBooleanSignal(options.open);

      return {
        [Symbol.iterator]: signal[Symbol.iterator],
        *pour(items) {
          if (Array.isArray(items)) {
            for (let i of items) {
              yield* is(open, (open) => open);
              yield* signal.send(i);
            }
          } else {
            yield* items(function* (item) {
              yield* is(open, (open) => open);
              yield* signal.send(item);
            });
          }
        },
        close() {
          open.set(false);
        },
        open() {
          open.set(true);
        },
      };
    },
  };
}
