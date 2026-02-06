import type { Stream } from "effection";

/**
 * Creates a stream transformer that yields values from the source stream
 * until the predicate returns true. Closes with the matching value when
 * the predicate returns true.
 *
 * This is useful for "iterate until a condition is met" patterns, where
 * the matching value is meaningful (e.g., a terminal status).
 *
 * If the source stream closes before the predicate returns true, the
 * resulting stream closes with the source's close value.
 *
 * @template T - The type of items in the stream
 * @template TClose - The type of the close value
 * @param predicate - A function that returns true to stop taking values
 * @returns A stream transformer that yields values until predicate is true,
 *          closing with the matching value
 *
 * @example
 * ```typescript
 * import { takeUntil, forEach } from "@effectionx/stream-helpers";
 *
 * // Iterate validation progress until we get a terminal status
 * const result = yield* forEach(function*(progress) {
 *   showSpinner(progress.status);
 * }, takeUntil((p) => p.status === "valid" || p.status === "invalid")(channel));
 *
 * // result is the validation object with terminal status
 * if (result.status === "valid") {
 *   // proceed
 * }
 * ```
 *
 * @example
 * ```typescript
 * import { takeUntil, map } from "@effectionx/stream-helpers";
 * import { pipe } from "remeda";
 *
 * const limited = pipe(
 *   source,
 *   takeUntil((x) => x.done),
 * );
 * ```
 */
export function takeUntil<T>(
  predicate: (item: T) => boolean,
): <TClose>(stream: Stream<T, TClose>) => Stream<T, T | TClose> {
  return <TClose>(stream: Stream<T, TClose>): Stream<T, T | TClose> => ({
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      let done = false;

      return {
        *next() {
          if (done) {
            return { done: true, value: undefined as unknown as T | TClose };
          }

          const result = yield* subscription.next();
          if (result.done) {
            return result;
          }

          if (predicate(result.value)) {
            done = true;
            // Close with the matching value
            return { done: true, value: result.value };
          }

          return result;
        },
      };
    },
  });
}
