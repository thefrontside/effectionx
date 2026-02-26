import { Err, Ok, type Result } from "effection";
import type { Context, Coroutine, Effect, Operation, Scope } from "effection";
import {
  DelimiterContext,
  type Instruction,
  InstructionQueue,
  api as effection,
} from "effection/experimental";
import type { DurableStream } from "./types.ts";
import type { DurableEvent } from "./types.ts";
import {
  DivergenceError,
  type Json,
  type SerializedError,
  createLiveOnlySentinel,
} from "./types.ts";

const api = effection.Scope;

// ── Infrastructure effects ─────────────────────────────────────────
//
// Effection ^4 internal effect descriptions that always execute live
// (never recorded/replayed). These are the framework's own plumbing.

export const INFRASTRUCTURE_EFFECTS: ReadonlySet<string> = new Set([
  "useCoroutine()",
  "useScope()",
  "trap return",
  "await resource",
  "await winner",
  "await delimiter",
  "await future",
  "await destruction",
  "await callcc",
  "await each done",
  "await each context",
]);

// ── Serialization helpers ──────────────────────────────────────────

/**
 * Serialize a value to Json, replacing non-serializable values with
 * a __liveOnly sentinel. Uses a WeakSet for cycle detection.
 */
export function toJson(value: unknown, seen?: WeakSet<object>): Json {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number") return value;
  if (typeof value === "boolean") return value;

  if (Array.isArray(value)) {
    let tracking = seen ?? new WeakSet();
    if (tracking.has(value)) {
      return createLiveOnlySentinel(value) as unknown as Json;
    }
    tracking.add(value);
    return value.map((item) => toJson(item, tracking));
  }

  if (typeof value === "object") {
    let tracking = seen ?? new WeakSet();
    if (tracking.has(value)) {
      return createLiveOnlySentinel(value) as unknown as Json;
    }
    tracking.add(value);

    let proto = Object.getPrototypeOf(value);
    if (proto === Object.prototype || proto === null) {
      let result: Record<string, Json> = {};
      for (let key of Object.keys(value as Record<string, unknown>)) {
        result[key] = toJson((value as Record<string, unknown>)[key], tracking);
      }
      return result;
    }
    return createLiveOnlySentinel(value) as unknown as Json;
  }

  return createLiveOnlySentinel(value) as unknown as Json;
}

function normalizeError(value: unknown): Error {
  if (value instanceof Error) return value;
  return new Error(typeof value === "string" ? value : String(value));
}

function serializeError(error: Error, seen?: WeakSet<Error>): SerializedError {
  let result: SerializedError = {
    name: error.name,
    message: error.message,
    stack: error.stack,
  };
  if (error.cause instanceof Error) {
    let tracking = seen ?? new WeakSet();
    if (!tracking.has(error.cause)) {
      tracking.add(error.cause);
      result.cause = serializeError(error.cause, tracking);
    }
  }
  return result;
}

function deserializeError(serialized: SerializedError): Error {
  let cause: Error | undefined;
  if (serialized.cause) {
    cause = deserializeError(serialized.cause);
  }
  let error = new Error(serialized.message, cause ? { cause } : undefined);
  error.name = serialized.name;
  if (serialized.stack) {
    error.stack = serialized.stack;
  }
  return error;
}

// ── Replay Index ───────────────────────────────────────────────────
//
// Indexes replay events for per-coroutine access. The 4-event schema
// makes this significantly simpler than durably's 8-event ReplayIndex.

class ReplayIndex {
  /**
   * Per-coroutine list of user-facing yield events.
   */
  private coroutineYields = new Map<
    string,
    Array<{ offset: number; event: DurableEvent }>
  >();

  /**
   * Per-coroutine cursor into the coroutineYields arrays.
   */
  private coroutineCursors = new Map<string, number>();

  /**
   * Map from effectId to its resolution (next) event.
   */
  private resolutions = new Map<string, DurableEvent>();

  /**
   * Spawn events in stream order for sequential consumption.
   */
  private spawnOrder: Array<DurableEvent & { type: "spawn" }> = [];
  private spawnCursor = 0;

  /**
   * Close events indexed by coroutineId.
   */
  private closeEvents = new Map<string, DurableEvent & { type: "close" }>();

  /**
   * Set of consumed coroutine IDs.
   */
  private consumedSpawns = new Set<string>();
  private consumedCloses = new Set<string>();

  /**
   * Whether there are any replay events at all.
   */
  readonly hasEvents: boolean;

  constructor(
    entries: ReturnType<DurableStream["read"]>,
    isInfrastructure: (description: string) => boolean,
  ) {
    this.hasEvents = entries.length > 0;

    let infraEffectIds = new Set<string>();

    for (let i = 0; i < entries.length; i++) {
      let { event } = entries[i];

      if (event.type === "spawn") {
        this.spawnOrder.push(event);
        continue;
      }

      if (event.type === "close") {
        this.closeEvents.set(event.coroutineId, event);
        continue;
      }

      if (event.type === "yield") {
        if (isInfrastructure(event.description)) {
          infraEffectIds.add(event.effectId);
          continue;
        }

        let cid = event.coroutineId;
        if (!this.coroutineYields.has(cid)) {
          this.coroutineYields.set(cid, []);
        }
        this.coroutineYields.get(cid)!.push({ offset: i, event });
        continue;
      }

      if (event.type === "next") {
        if (infraEffectIds.has(event.effectId)) {
          continue;
        }
        this.resolutions.set(event.effectId, event);
      }
    }
  }

  // ── Spawn consumption (deterministic order) ──────────────────────

  peekSpawn(): (DurableEvent & { type: "spawn" }) | undefined {
    while (this.spawnCursor < this.spawnOrder.length) {
      let ev = this.spawnOrder[this.spawnCursor];
      if (this.consumedSpawns.has(ev.childCoroutineId)) {
        this.spawnCursor++;
        continue;
      }
      return ev;
    }
    return undefined;
  }

  consumeSpawn(childCoroutineId: string): void {
    this.consumedSpawns.add(childCoroutineId);
    while (
      this.spawnCursor < this.spawnOrder.length &&
      this.consumedSpawns.has(
        this.spawnOrder[this.spawnCursor].childCoroutineId,
      )
    ) {
      this.spawnCursor++;
    }
  }

  hasSpawn(childCoroutineId: string): boolean {
    return (
      this.spawnOrder.some((e) => e.childCoroutineId === childCoroutineId) &&
      !this.consumedSpawns.has(childCoroutineId)
    );
  }

  get hasMoreSpawns(): boolean {
    return this.peekSpawn() !== undefined;
  }

  // ── Close lookup (per-coroutine) ─────────────────────────────────

  hasClose(coroutineId: string): boolean {
    return (
      this.closeEvents.has(coroutineId) && !this.consumedCloses.has(coroutineId)
    );
  }

  getClose(
    coroutineId: string,
  ): (DurableEvent & { type: "close" }) | undefined {
    if (this.consumedCloses.has(coroutineId)) return undefined;
    return this.closeEvents.get(coroutineId);
  }

  consumeClose(coroutineId: string): void {
    this.consumedCloses.add(coroutineId);
  }

  // ── Per-coroutine yield cursors ──────────────────────────────────

  peekYield(coroutineId: string): DurableEvent | undefined {
    let yields = this.coroutineYields.get(coroutineId);
    if (!yields) return undefined;
    let cursor = this.coroutineCursors.get(coroutineId) ?? 0;
    if (cursor < yields.length) {
      return yields[cursor].event;
    }
    return undefined;
  }

  consumeYield(coroutineId: string): void {
    let cursor = this.coroutineCursors.get(coroutineId) ?? 0;
    this.coroutineCursors.set(coroutineId, cursor + 1);
  }

  getYieldOffset(coroutineId: string): number {
    let yields = this.coroutineYields.get(coroutineId);
    if (!yields) return -1;
    let cursor = this.coroutineCursors.get(coroutineId) ?? 0;
    if (cursor < yields.length) {
      return yields[cursor].offset;
    }
    return -1;
  }

  hasYields(coroutineId: string): boolean {
    let yields = this.coroutineYields.get(coroutineId);
    if (!yields) return false;
    let cursor = this.coroutineCursors.get(coroutineId) ?? 0;
    return cursor < yields.length;
  }

  getResolution(effectId: string): DurableEvent | undefined {
    return this.resolutions.get(effectId);
  }
}

// ── DurableReducer ─────────────────────────────────────────────────
//
// Replaces Effection's built-in Reducer for durable execution.
//
// Duck-typed to match the Reducer interface:
//   - `reducing: boolean`
//   - `reduce(instruction: Instruction): void`
//
// Records/replays using the 4-event protocol (yield, next, close, spawn).

export class DurableReducer {
  reducing = false;
  readonly queue = new InstructionQueue();

  private replayIndex: ReplayIndex;
  private coroutineIds = new WeakMap<Scope, string>();
  private coroutineParents = new Map<string, string | undefined>();
  private coroutineOrdinal = 0;
  private effectCounter: number;

  readonly stream: DurableStream;

  constructor(stream: DurableStream) {
    this.stream = stream;
    this.effectCounter = stream.length;
    this.replayIndex = new ReplayIndex(stream.read(0), (desc) =>
      this.isInfrastructureEffect(desc),
    );
  }

  private nextEffectId(): string {
    return `effect-${++this.effectCounter}`;
  }

  private nextCoroutineId(): string {
    return `coroutine-${++this.coroutineOrdinal}`;
  }

  getCoroutineId(scope: Scope): string {
    let id = this.coroutineIds.get(scope);
    if (!id) {
      throw new Error(
        "DurableReducer: scope not registered. This indicates a lifecycle bug — " +
          "the scope was not created through the durable middleware.",
      );
    }
    return id;
  }

  private registerCoroutine(scope: Scope, id: string, parentId?: string): void {
    this.coroutineIds.set(scope, id);
    this.coroutineParents.set(id, parentId);
  }

  getParentCoroutineId(coroutineId: string): string | undefined {
    return this.coroutineParents.get(coroutineId);
  }

  private unregisterCoroutine(scope: Scope): void {
    let id = this.coroutineIds.get(scope);
    if (id) this.coroutineParents.delete(id);
    this.coroutineIds.delete(scope);
  }

  installScopeMiddleware(runScope: Scope): void {
    this.registerCoroutine(runScope, "root");

    // Record or consume the root's spawn-equivalent. The root
    // coroutine doesn't have a spawn event (it IS the workflow),
    // but we track it via a synthetic "root" registration.
    // No spawn event is emitted for root — it's implicit.

    let reducer = this;
    let rootCloseEmitted = false;

    runScope.around(
      api,
      {
        create(
          args: [Scope],
          next: (parent: Scope) => [Scope, () => Operation<void>],
        ) {
          let [parent] = args;
          let parentCoroutineId = reducer.coroutineIds.get(parent);

          let [child, destroy] = next(parent);

          // Check if the next spawn in the replay matches
          let ev = reducer.replayIndex.peekSpawn();
          if (ev && ev.coroutineId === parentCoroutineId) {
            // Replay path: reuse the recorded coroutine ID
            reducer.registerCoroutine(
              child,
              ev.childCoroutineId,
              parentCoroutineId,
            );
            reducer.replayIndex.consumeSpawn(ev.childCoroutineId);
          } else {
            // Live path: assign new ID and record spawn event
            let coroutineId = reducer.nextCoroutineId();
            reducer.registerCoroutine(child, coroutineId, parentCoroutineId);

            if (parentCoroutineId) {
              reducer.stream.append({
                type: "spawn",
                coroutineId: parentCoroutineId,
                childCoroutineId: coroutineId,
              });
            }
          }

          return [child, destroy];
        },

        *destroy(args: [Scope], next: (scope: Scope) => Operation<void>) {
          let [scope] = args;
          let coroutineId = reducer.coroutineIds.get(scope);

          let closeStatus: "ok" | "err" | "cancelled" = "ok";
          let closeError: SerializedError | undefined;
          let closeValue: Json | undefined;

          try {
            yield* next(scope);
          } catch (error) {
            closeStatus = "err";
            closeError = serializeError(normalizeError(error));
            throw error;
          } finally {
            if (coroutineId) {
              // Determine close status from delimiter if available
              let delimiter = scope.get(DelimiterContext);
              if (delimiter?.computed && delimiter.outcome?.exists) {
                let outcome = delimiter.outcome.value;
                if (outcome.ok) {
                  closeStatus = "ok";
                  closeValue = toJson(outcome.value);
                } else {
                  closeStatus = "err";
                  closeError = serializeError(outcome.error);
                }
              }

              // Emit close event for this coroutine
              if (reducer.replayIndex.hasClose(coroutineId)) {
                reducer.replayIndex.consumeClose(coroutineId);
              } else {
                let closeEvent: DurableEvent = {
                  type: "close",
                  coroutineId,
                  status: closeStatus,
                };
                if (closeStatus === "ok" && closeValue !== undefined) {
                  (closeEvent as { value?: Json }).value = closeValue;
                }
                if (closeStatus === "err" && closeError) {
                  (closeEvent as { error?: SerializedError }).error =
                    closeError;
                }
                reducer.stream.append(closeEvent);
              }
              // Capture parent before unregistering (unregister deletes the mapping)
              let parentId = reducer.getParentCoroutineId(coroutineId);
              reducer.unregisterCoroutine(scope);

              // When a direct child of root is destroyed, emit root's
              // close event synchronously within structured teardown.
              if (
                parentId === "root" &&
                reducer.coroutineIds.get(runScope) === "root" &&
                !rootCloseEmitted
              ) {
                rootCloseEmitted = true;

                let rootStatus: "ok" | "err" | "cancelled" = "ok";
                let rootValue: Json | undefined;
                let rootError: SerializedError | undefined;

                // Check the child's delimiter for root outcome
                let childDelimiter = scope.get(DelimiterContext);
                if (
                  childDelimiter?.computed &&
                  childDelimiter.outcome?.exists
                ) {
                  let childOutcome = childDelimiter.outcome.value;
                  if (childOutcome.ok) {
                    rootStatus = "ok";
                    rootValue = toJson(childOutcome.value);
                  } else {
                    rootStatus = "err";
                    rootError = serializeError(childOutcome.error);
                  }
                }

                if (reducer.replayIndex.hasClose("root")) {
                  reducer.replayIndex.consumeClose("root");
                } else {
                  let rootClose: DurableEvent = {
                    type: "close",
                    coroutineId: "root",
                    status: rootStatus,
                  };
                  if (rootStatus === "ok" && rootValue !== undefined) {
                    (rootClose as { value?: Json }).value = rootValue;
                  }
                  if (rootStatus === "err" && rootError) {
                    (rootClose as { error?: SerializedError }).error =
                      rootError;
                  }
                  reducer.stream.append(rootClose);
                }
              }
            }
          }
        },
      },
      { at: "max" },
    );
  }

  reduce = (instruction: Instruction) => {
    let { queue } = this;

    queue.enqueue(instruction);

    if (this.reducing) return;

    try {
      this.reducing = true;

      let item = queue.dequeue();
      while (item) {
        let [, routine, result, , method = "next" as const] = item;
        try {
          let iterator = routine.data.iterator;

          if (result.ok) {
            if (method === "next") {
              let next = iterator.next(result.value);
              if (!next.done) {
                let effect = next.value;
                this.handleEffect(effect, routine);
              }
            } else if (iterator.return) {
              let next = iterator.return(result.value);
              if (!next.done) {
                let effect = next.value;
                this.handleEffect(effect, routine);
              }
            }
          } else if (iterator.throw) {
            let next = iterator.throw(result.error);
            if (!next.done) {
              let effect = next.value;
              this.handleEffect(effect, routine);
            }
          } else {
            throw result.error;
          }
        } catch (error) {
          if (error instanceof DivergenceError) {
            throw error;
          }
          routine.next(Err(normalizeError(error)));
        }
        item = queue.dequeue();
      }
    } finally {
      this.reducing = false;
    }
  };

  private isInfrastructureEffect(description: string): boolean {
    if (description.startsWith("do <")) return true;
    return INFRASTRUCTURE_EFFECTS.has(description);
  }

  private handleEffect(effect: Effect<unknown>, routine: Coroutine): void {
    let description = effect.description ?? "unknown";

    // Infrastructure effects always execute live.
    if (this.isInfrastructureEffect(description)) {
      routine.data.exit = effect.enter(routine.next, routine);
      return;
    }

    let effectId = this.nextEffectId();
    let shouldRecordYield = true;

    let coroutineId = this.coroutineIds.get(routine.scope);
    if (!coroutineId) {
      // Scope was unregistered during teardown — execute live.
      routine.data.exit = effect.enter(routine.next, routine);
      return;
    }

    // Check if we can replay this effect (per-coroutine cursor)
    let replayEvent = this.replayIndex.peekYield(coroutineId);

    if (replayEvent && replayEvent.type === "yield") {
      // Divergence detection
      if (replayEvent.description !== description) {
        throw new DivergenceError(
          replayEvent.description,
          description,
          this.replayIndex.getYieldOffset(coroutineId),
        );
      }

      effectId = replayEvent.effectId;
      this.replayIndex.consumeYield(coroutineId);

      let resolutionEvent = this.replayIndex.getResolution(effectId);

      if (resolutionEvent && resolutionEvent.type === "next") {
        if (resolutionEvent.status === "ok") {
          let result: Result<unknown> = Ok(resolutionEvent.value);
          routine.data.exit = (resolve) => resolve(Ok());
          routine.next(result);
          return;
        }
        if (resolutionEvent.status === "err" && resolutionEvent.error) {
          let error = deserializeError(resolutionEvent.error);
          let result: Result<unknown> = Err(error);
          routine.data.exit = (resolve) => resolve(Ok());
          routine.next(result);
          return;
        }
      }

      // Resolution missing — run live, record only the next event.
      shouldRecordYield = false;
    }

    // Live path: record and execute
    if (shouldRecordYield) {
      this.stream.append({
        type: "yield",
        coroutineId,
        effectId,
        description,
      });
    }

    let originalNext = routine.next.bind(routine);
    let stream = this.stream;

    let wrappedNext = (result: Result<unknown>) => {
      if (result.ok) {
        stream.append({
          type: "next",
          coroutineId,
          effectId,
          status: "ok",
          value: toJson(result.value),
        });
      } else {
        stream.append({
          type: "next",
          coroutineId,
          effectId,
          status: "err",
          error: serializeError(normalizeError(result.error)),
        });
      }

      routine.next = originalNext;
      originalNext(result);
    };

    routine.next = wrappedNext;
    try {
      routine.data.exit = effect.enter(routine.next, routine);
    } catch (e) {
      routine.next = originalNext;
      throw e;
    }
  }
}

function isInfrastructureContext(name: string): boolean {
  if (name.startsWith("api::")) return true;
  return false;
}

// Export for use by test helpers
export { isInfrastructureContext };
