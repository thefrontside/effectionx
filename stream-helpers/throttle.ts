import { timebox } from "@effectionx/timebox";
import { type Operation, type Stream, type Task, spawn } from "effection";

/**
 * Throttles a stream to emit at most one value per `delayMS` milliseconds.
 *
 * Uses leading+trailing semantics:
 * - The first upstream value is emitted immediately (leading edge).
 * - While the throttle window is open, upstream values are consumed and only
 *   the latest is buffered.
 * - After the window expires, the buffered value is emitted (trailing edge),
 *   which opens a new window.
 * - Two emissions are never closer together than `delayMS`.
 *
 * Stream-completion exception: if the upstream closes during an open window,
 * the trailing value (if any) is emitted promptly without waiting for the
 * remaining delay, and `done` follows on the next pull.  This avoids adding
 * artificial latency before propagating the close signal.
 *
 * @param delayMS - minimum milliseconds between emissions
 */
export function throttle<A>(
  delayMS: number,
): <TClose>(stream: Stream<A, TClose>) => Stream<A, TClose> {
  return <TClose>(stream: Stream<A, TClose>): Stream<A, TClose> => ({
    *[Symbol.iterator]() {
      const subscription = yield* stream;

      // ── shared state ──────────────────────────────────────────────
      let lastPull: Task<IteratorResult<A, TClose>> | undefined;
      let windowDeadline: number | undefined;
      let pendingTrailing: A | undefined;
      let hasTrailing = false;
      let doneResult: IteratorResult<A, TClose> | undefined;

      // ── helpers ───────────────────────────────────────────────────

      /** Consume upstream values until the window deadline expires. */
      function* absorbUntilDeadline(): Operation<void> {
        while (windowDeadline !== undefined) {
          const remaining = windowDeadline - performance.now();
          if (remaining <= 0) break;

          if (!lastPull) {
            lastPull = yield* spawn(() => subscription.next());
          }
          const tb = yield* timebox(remaining, () => lastPull!);

          if (tb.timeout) {
            // lastPull survives for the next pull
            break;
          }

          const upstream = tb.value;
          lastPull = undefined;

          if (upstream.done) {
            doneResult = upstream;
            break;
          }

          pendingTrailing = upstream.value;
          hasTrailing = true;
        }
        windowDeadline = undefined;
      }

      // ── subscription ─────────────────────────────────────────────
      return {
        *next(): Operation<IteratorResult<A, TClose>> {
          // ── drain active window ───────────────────────────────────
          if (windowDeadline !== undefined) {
            yield* absorbUntilDeadline();
          }

          // ── emit buffered trailing value ──────────────────────────
          if (hasTrailing) {
            const value = pendingTrailing as A;
            hasTrailing = false;
            pendingTrailing = undefined;

            if (!doneResult) {
              windowDeadline = performance.now() + delayMS;
            }

            return { done: false as const, value };
          }

          // ── propagate stream close ────────────────────────────────
          if (doneResult) {
            return doneResult;
          }

          // ── pull next upstream value (leading edge) ───────────────
          const result = lastPull
            ? yield* lastPull
            : yield* subscription.next();
          lastPull = undefined;

          if (result.done) {
            return result;
          }

          // Record the window deadline. Absorption is deferred to the
          // next next() call so this value returns immediately.
          windowDeadline = performance.now() + delayMS;

          return { done: false as const, value: result.value };
        },
      };
    },
  });
}
