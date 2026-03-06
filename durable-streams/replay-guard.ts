/**
 * ReplayGuard API — pluggable validation for replay staleness detection.
 *
 * The durable execution protocol's default behavior is "logs are authoritative"
 * — the journal is unconditionally trusted during replay. ReplayGuard extends
 * this with opt-in validation: guards can examine effect descriptions and
 * result values to validate that recorded results are still valid against
 * current state before allowing replay to proceed.
 *
 * Guards access `event.description.*` for effect input fields (e.g., file
 * path, URL, encoding) and `event.result.value.*` for effect output fields
 * (e.g., content hash, status code). There is no separate metadata field —
 * inputs belong in the effect description, outputs belong in the result.
 *
 * The API has two phases:
 *
 * 1. **check** (before replay begins): Runs in generator context inside
 *    `durableRun`, after the journal is loaded but before the workflow starts.
 *    I/O is allowed — this is where file hashing, network checks, and other
 *    observation-gathering happens. Results are cached in middleware closures.
 *
 * 2. **decide** (during replay): Runs synchronously inside
 *    `DurableEffect.enter()`, after identity matching succeeds but before
 *    the stored result is fed to the generator. Must be pure and side-effect-
 *    free. Reads from the cache populated during the check phase.
 *
 * Multiple guards compose via Effection's `scope.around()`. A guard that has
 * an opinion returns an outcome directly; one that doesn't calls `next(event)`
 * to delegate. The first `error` outcome wins — the chain short-circuits.
 *
 * See replay-guard-spec.md for the full design.
 */

import { createApi } from "effection/experimental";
import type { Api, Operation } from "effection";
import type { Yield } from "./types.ts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/**
 * The outcome of a replay guard's decision.
 *
 * - "replay": Proceed with replay — use the stored journal result.
 * - "error": Halt replay with an error — the journal entry is stale.
 *
 * Future versions may add:
 * - "reexecute": Re-execute the effect and replace the journal entry.
 * - "fork": Create a new execution branch from this point.
 */
export type ReplayOutcome =
  | { outcome: "replay" }
  | { outcome: "error"; error?: Error };

// ---------------------------------------------------------------------------
// API shape
// ---------------------------------------------------------------------------

/**
 * The core shape of the ReplayGuard API.
 *
 * - `check`: Called once per Yield event, before replay begins. Runs in
 *   generator context — I/O is allowed. Use to gather current state (hash
 *   files, check timestamps) and cache results for the decide phase.
 *
 * - `decide`: Called during replay, after identity matching succeeds.
 *   Must be pure and synchronous — no I/O, no side effects. Returns the
 *   replay outcome based on cached observations.
 */
interface ReplayGuardApi {
  /** Phase 1: Check — gather observations before replay (I/O allowed). */
  check(event: Yield): Operation<void>;
  /** Phase 2: Decide — return replay outcome (synchronous, pure). */
  decide(event: Yield): ReplayOutcome;
}

// ---------------------------------------------------------------------------
// Default implementation (pass-through)
// ---------------------------------------------------------------------------

/**
 * Default check — no-op. Events pass through without observation.
 */
function* defaultCheck(_event: Yield): Operation<void> {
  // No observation — pass through to next middleware or default.
}

/**
 * Default decide — always replay. This preserves "logs are authoritative"
 * as the default behavior. Guards must be explicitly installed to add
 * validation.
 */
function defaultDecide(_event: Yield): ReplayOutcome {
  return { outcome: "replay" };
}

// ---------------------------------------------------------------------------
// The ReplayGuard API instance
// ---------------------------------------------------------------------------

/**
 * The ReplayGuard API.
 *
 * Default behavior is pass-through: `check` does nothing, `decide` returns
 * `{ outcome: "replay" }`. This preserves "logs are authoritative" unless
 * middleware says otherwise.
 *
 * Install guards via `scope.around(ReplayGuard, { ... })` before calling
 * `durableRun`. Guards are inherited by child scopes through Effection's
 * context inheritance.
 *
 * Example:
 * ```ts
 * function* myWorkflow(): Operation<void> {
 *   const scope = yield* useScope();
 *   scope.around(ReplayGuard, {
 *     *check([event], next) {
 *       // Gather observations (I/O allowed here)
 *       return yield* next(event);
 *     },
 *     decide([event], next) {
 *       // Make decision (pure, synchronous)
 *       if (isStale(event)) {
 *         return { outcome: "error", error: new StaleInputError(...) };
 *       }
 *       return next(event);
 *     },
 *   });
 *
 *   yield* durableRun(workflow, { stream });
 * }
 * ```
 */
export const ReplayGuard: Api<ReplayGuardApi> = createApi<ReplayGuardApi>(
  "DurableEffection.ReplayGuard",
  { check: defaultCheck, decide: defaultDecide },
);
