import { timebox } from "@effectionx/timebox";
import { createArraySignal } from "@effectionx/signals";
import { type Stream, spawn } from "effection";

/**
 * Throttles a stream to emit at most one value per `delayMS` milliseconds.
 *
 * Uses leading+trailing semantics:
 * - The first upstream value is emitted immediately (leading edge).
 * - While the throttle window is open, upstream values are consumed eagerly
 *   and only the latest is buffered.
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
      const output = yield* createArraySignal<IteratorResult<A, TClose>>([]);

      // ── pump ──────────────────────────────────────────────────────
      // A persistent background task that owns all upstream reads.
      // It alternates between two phases:
      //   1. Pull the next upstream value and push it (leading edge).
      //   2. Open a window for delayMS: consume upstream, keep only
      //      the latest, then push it when the window expires
      //      (trailing edge).
      yield* spawn(function* () {
        while (true) {
          // ── leading edge ────────────────────────────────────────
          const first = yield* subscription.next();
          if (first.done) {
            output.push(first);
            return;
          }
          output.push({ done: false as const, value: first.value });

          // ── absorption window ───────────────────────────────────
          let trailing: A | undefined;
          let hasTrailing = false;
          const windowStart = performance.now();

          while (true) {
            const remaining = delayMS - (performance.now() - windowStart);
            if (remaining <= 0) break;

            const tb = yield* timebox(remaining, () => subscription.next());

            if (tb.timeout) {
              break;
            }

            if (tb.value.done) {
              // Stream closed during window — flush trailing, then done
              if (hasTrailing) {
                output.push({ done: false as const, value: trailing as A });
              }
              output.push(tb.value);
              return;
            }

            trailing = tb.value.value;
            hasTrailing = true;
          }

          // ── trailing edge ───────────────────────────────────────
          if (hasTrailing) {
            output.push({ done: false as const, value: trailing as A });
          }
        }
      });

      // ── subscription ─────────────────────────────────────────────
      return {
        *next() {
          return yield* output.shift();
        },
      };
    },
  });
}
