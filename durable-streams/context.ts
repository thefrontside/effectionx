/**
 * DurableContext — the scope-local state for durable execution.
 *
 * Stored on each Effection scope via createContext(). Child scopes
 * inherit the shared replayIndex and stream, but get their own
 * coroutineId and childCounter.
 */

import { createContext, type Context } from "effection";
import type { ReplayIndex } from "./replay-index.ts";
import type { DurableStream } from "./stream.ts";
import type { CoroutineId } from "./types.ts";

export interface DurableContext {
  /** Shared replay index (built from stream on startup). */
  replayIndex: ReplayIndex;
  /** Shared durable stream for appending events. */
  stream: DurableStream;
  /** This coroutine's hierarchical ID. */
  coroutineId: CoroutineId;
  /** Counter for assigning child IDs. */
  childCounter: number;
}

/**
 * Effection Context for durable execution state.
 * Set on the root scope by durableRun(); inherited by child scopes.
 */
export const DurableCtx: Context<DurableContext> = createContext<DurableContext>(
  "@effection/durable",
);
