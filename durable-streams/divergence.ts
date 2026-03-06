/**
 * Divergence API — pluggable policy for handling replay mismatches.
 *
 * When a durable effect's description doesn't match the replay index
 * during replay, or when a generator continues to yield effects past
 * a recorded Close event, a divergence is detected.
 *
 * By default, divergence is fatal (throws DivergenceError). Users can
 * override this behavior per-scope via Effection's around() middleware
 * to implement custom policies (e.g., switching to live execution).
 *
 * Uses createApi() from @effection/effection/experimental to get
 * proper middleware dispatch with caching and invalidation. The
 * circular initialization bug that prevented this in alpha.5 was
 * fixed in alpha.6 (see DEC-031).
 *
 * The core decide() function is synchronous (not a generator) because
 * it is called from inside Effect.enter(), which is a synchronous
 * callback. createApi().invoke() dispatches synchronously, so this
 * is safe. See DEC-031.
 */

import { createApi } from "effection/experimental";
import type { Api } from "effection";
import { ContinuePastCloseDivergenceError, DivergenceError } from "./errors.ts";
import type { CoroutineId, EffectDescription } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** The two kinds of divergence detected during replay. */
export type DivergenceKind = "description-mismatch" | "continue-past-close";

/**
 * Information about a detected divergence.
 *
 * Discriminated union on `kind` so that TypeScript enforces correct
 * field access per variant.
 */
export type DivergenceInfo =
  | {
      kind: "description-mismatch";
      coroutineId: CoroutineId;
      /** Cursor position (yield index) where divergence was detected. */
      cursor: number;
      /** The description from the journal (what was expected). */
      expected: EffectDescription;
      /** The description from the generator (what was actually yielded). */
      actual: EffectDescription;
    }
  | {
      kind: "continue-past-close";
      coroutineId: CoroutineId;
      /** Number of yield entries recorded for this coroutine. */
      yieldCount: number;
    };

/**
 * The policy decision returned by the Divergence API.
 *
 * - "throw": Fail the workflow with the provided error (default behavior).
 * - "run-live": Disable replay for this coroutine and execute live from
 *   this point forward. Previous replay entries are ignored.
 */
export type DivergenceDecision =
  | { type: "throw"; error: Error }
  | { type: "run-live" };

// ---------------------------------------------------------------------------
// API shape (synchronous — not generator-based)
// ---------------------------------------------------------------------------

/**
 * The core shape of the Divergence API.
 *
 * decide() is synchronous because it is called from Effect.enter(),
 * which cannot yield. Middleware installed via scope.around() also
 * runs synchronously in the chain.
 *
 * Usage from Effect.enter() (synchronous):
 *   Divergence.invoke(scope, "decide", [info])
 *
 * Middleware installation (from a generator):
 *   scope.around(Divergence, { decide: ([info], next) => { ... } })
 */
interface DivergenceApi {
  decide(info: DivergenceInfo): DivergenceDecision;
}

// ---------------------------------------------------------------------------
// Default policy (strict — all divergences are fatal)
// ---------------------------------------------------------------------------

/** The default (strict) decide function. */
function defaultDecide(info: DivergenceInfo): DivergenceDecision {
  if (info.kind === "description-mismatch") {
    return {
      type: "throw",
      error: new DivergenceError(
        info.coroutineId,
        info.cursor,
        info.expected,
        info.actual,
      ),
    };
  } else {
    return {
      type: "throw",
      error: new ContinuePastCloseDivergenceError(
        info.coroutineId,
        info.yieldCount,
      ),
    };
  }
}

// ---------------------------------------------------------------------------
// The Divergence API instance
// ---------------------------------------------------------------------------

/**
 * The Divergence API.
 *
 * Created via Effection's createApi() which provides proper middleware
 * dispatch with WeakMap-based handle caching, automatic cache
 * invalidation on scope.around(), and a fast-path that skips
 * middleware dispatch entirely when no middleware is installed.
 *
 * Default behavior is strict: all divergences produce a throw decision
 * with the appropriate error type.
 */
export const Divergence: Api<DivergenceApi> = createApi<DivergenceApi>(
  "DurableEffection.Divergence",
  { decide: defaultDecide },
);
