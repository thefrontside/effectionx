import { timebox } from "@effectionx/timebox";
import { createArraySignal } from "@effectionx/signals";
import { type Operation, type Stream, sleep, spawn } from "effection";

/**
 * A tagged output item.  `flush` marks values that should bypass
 * consumer-side delay enforcement (stream-completion trailing and the
 * done sentinel).
 */
interface OutputItem<A, TClose> {
  result: IteratorResult<A, TClose>;
  flush: boolean;
}

/**
 * Throttles a stream to emit at most one value per `delayMS` milliseconds.
 *
 * Uses leading+trailing semantics:
 * - The first upstream value is emitted immediately (leading edge).
 * - While the throttle window is open, upstream values are consumed eagerly
 *   and only the latest is buffered.
 * - After the window expires, the buffered value is emitted (trailing edge),
 *   which opens a new window.
 * - Two emissions are never closer together than `delayMS`, both at the
 *   pump side (window timing) and at the consumer side (delay gate in
 *   `next()`), so a slow consumer cannot drain a backlog instantly.
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
      const output = yield* createArraySignal<OutputItem<A, TClose>>([]);

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
            output.push({ result: first, flush: true });
            return;
          }
          output.push({
            result: { done: false as const, value: first.value },
            flush: false,
          });

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
                output.push({
                  result: { done: false as const, value: trailing as A },
                  flush: true,
                });
              }
              output.push({ result: tb.value, flush: true });
              return;
            }

            trailing = tb.value.value;
            hasTrailing = true;
          }

          // ── trailing edge ───────────────────────────────────────
          if (hasTrailing) {
            output.push({
              result: { done: false as const, value: trailing as A },
              flush: false,
            });
          }
        }
      });

      // ── consumer-side delay gate ───────────────────────────────
      let lastEmitTime: number | undefined;

      return {
        *next(): Operation<IteratorResult<A, TClose>> {
          const { result, flush } = yield* output.shift();

          // Enforce minimum spacing between non-flush emissions.
          // The first emission (lastEmitTime undefined) passes through
          // immediately.  Flush items (stream-completion trailing and
          // done) bypass the gate so close is not artificially delayed.
          if (!result.done && !flush && lastEmitTime !== undefined) {
            const wait = delayMS - (performance.now() - lastEmitTime);
            if (wait > 0) {
              yield* sleep(wait);
            }
          }

          if (!result.done) {
            lastEmitTime = performance.now();
          }

          return result;
        },
      };
    },
  });
}
