import { timebox } from "@effectionx/timebox";
import { type Stream, type Task, spawn } from "effection";

/**
 * Throttles a stream to emit at most one value per `delayMS` milliseconds.
 *
 * Uses leading+trailing semantics: the first value is emitted immediately,
 * intermediate values during the throttle window are dropped, and the most
 * recent value is always emitted after the window expires. This ensures the
 * final state is never lost when a burst of events ends mid-window.
 *
 * @param delayMS - The minimum time between emissions in milliseconds
 */
export function throttle<A>(
  delayMS: number,
): <TClose>(stream: Stream<A, TClose>) => Stream<A, TClose> {
  return <TClose>(stream: Stream<A, TClose>): Stream<A, TClose> => ({
    *[Symbol.iterator]() {
      const subscription = yield* stream;
      let lastPull: Task<IteratorResult<A, TClose>> | undefined;
      let pendingTrailing: A | undefined;
      let hasTrailing = false;
      let doneResult: IteratorResult<A, TClose> | undefined;

      return {
        *next() {
          // Emit stashed trailing value from previous window
          if (hasTrailing) {
            const value = pendingTrailing as A;
            hasTrailing = false;
            pendingTrailing = undefined;
            return { done: false as const, value };
          }

          // Stream already ended
          if (doneResult) {
            return doneResult;
          }

          // Pull the next upstream value
          const result = lastPull
            ? yield* lastPull
            : yield* subscription.next();
          lastPull = undefined;

          if (result.done) {
            return result;
          }

          const valueToEmit = result.value;

          // Throttle window: absorb upstream values for delayMS
          const windowStart = performance.now();

          while (true) {
            const remaining = delayMS - (performance.now() - windowStart);
            if (remaining <= 0) break;

            lastPull = yield* spawn(() => subscription.next());
            const tb = yield* timebox(remaining, () => lastPull!);

            if (tb.timeout) {
              // Timer expired, lastPull survives for next call
              break;
            }

            const upstream = tb.value;
            lastPull = undefined;

            if (upstream.done) {
              doneResult = upstream;
              break;
            }

            // Overwrite trailing — only the latest matters
            pendingTrailing = upstream.value;
            hasTrailing = true;
          }

          // Emit the leading-edge value
          return { done: false as const, value: valueToEmit };
        },
      };
    },
  });
}
