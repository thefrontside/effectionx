import {
  InstructionQueue,
  type Instruction,
  DelimiterContext,
} from "effection/experimental";
import { Err, Ok, type Result } from "effection";
import type { Context, Coroutine, Effect, Operation, Scope } from "effection";
import type { DurableStream } from "./types.ts";
import type { DurableEvent } from "./types.ts";
import {
  type Json,
  type SerializedError,
  DivergenceError,
  createLiveOnlySentinel,
} from "./types.ts";

/**
 * Effection ^4 internal effect descriptions that should always execute live
 * (never recorded/replayed). Update if Effection adds/renames infrastructure effects.
 */
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

/**
 * Effection ^4 internal context names that should not be recorded.
 * Update if Effection adds/renames internal contexts.
 */
export const INFRASTRUCTURE_CONTEXTS: ReadonlySet<string> = new Set([
  "@effection/scope.generation",
  "@effection/scope.children",
  "@effection/coroutine",
  "@effection/reducer",
  "@effection/delimiter",
  "@effection/boundary",
  "@effection/task-group",
  "each",
]);

/**
 * Serialize a value to Json, replacing non-serializable values with
 * a __liveOnly sentinel. Uses a WeakSet for cycle detection to avoid
 * stack overflow on circular object graphs.
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
      // Recursively walk own properties so non-serializable nested values
      // become LiveOnlySentinel markers instead of being silently dropped
      // (which JSON.stringify/parse would do for functions, undefined, etc.).
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

function serializeError(
  error: Error,
  seen?: WeakSet<Error>,
): SerializedError {
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

/**
 * Indexes replay events for per-scope access.
 *
 * During concurrent execution, effects from different scopes interleave
 * non-deterministically. Both effect events and lifecycle events can
 * appear in different orders during replay. This index provides:
 *
 * 1. Per-scope effect cursors (effect:yielded + resolutions)
 * 2. Per-scope lifecycle event lookup (scope:created, scope:destroyed,
 *    workflow:return indexed by scopeId)
 * 3. Ordered scope creation list (for assigning scope IDs during replay)
 */
class ReplayIndex {
  /**
   * Per-scope list of user-facing effect events.
   */
  private scopeEffects = new Map<
    string,
    Array<{ offset: number; event: DurableEvent }>
  >();

  /**
   * Per-scope cursor into the scopeEffects arrays.
   */
  private scopeCursors = new Map<string, number>();

  /**
   * Map from effectId to its resolution event.
   */
  private resolutions = new Map<string, DurableEvent>();

  /**
   * scope:created events indexed by scopeId for direct lookup.
   */
  private scopeCreatedEvents = new Map<
    string,
    DurableEvent & { type: "scope:created" }
  >();

  /**
   * scope:destroyed events indexed by scopeId.
   */
  private scopeDestroyedEvents = new Map<
    string,
    DurableEvent & { type: "scope:destroyed" }
  >();

  /**
   * workflow:return events indexed by scopeId.
   */
  private workflowReturnEvents = new Map<
    string,
    DurableEvent & { type: "workflow:return" }
  >();

  /**
   * Ordered list of scope:created events for sequential consumption
   * during replay (scopes are created deterministically in tree order).
   */
  private scopeCreationOrder: Array<DurableEvent & { type: "scope:created" }> =
    [];
  private scopeCreationCursor = 0;

  /**
   * Set of consumed scope IDs (for lifecycle events).
   */
  private consumedCreations = new Set<string>();
  private consumedDestructions = new Set<string>();
  private consumedReturns = new Set<string>();

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

      if (event.type === "scope:created") {
        this.scopeCreatedEvents.set(event.scopeId, event);
        this.scopeCreationOrder.push(event);
        continue;
      }

      if (event.type === "scope:destroyed") {
        this.scopeDestroyedEvents.set(event.scopeId, event);
        continue;
      }

      if (event.type === "workflow:return") {
        this.workflowReturnEvents.set(event.scopeId, event);
        continue;
      }

      if (event.type === "scope:set" || event.type === "scope:delete") {
        // These are informational; not currently replayed with ordering
        continue;
      }

      if (event.type === "effect:yielded") {
        if (isInfrastructure(event.description)) {
          infraEffectIds.add(event.effectId);
          continue;
        }

        let scopeId = event.scopeId;
        if (!this.scopeEffects.has(scopeId)) {
          this.scopeEffects.set(scopeId, []);
        }
        this.scopeEffects.get(scopeId)!.push({ offset: i, event });
        continue;
      }

      if (event.type === "effect:resolved" || event.type === "effect:errored") {
        if (infraEffectIds.has(event.effectId)) {
          continue;
        }
        this.resolutions.set(event.effectId, event);
      }
    }
  }

  // ── Scope creation (deterministic tree order) ────────────────────

  /**
   * Peek at the next scope:created event in creation order.
   */
  peekScopeCreation(): (DurableEvent & { type: "scope:created" }) | undefined {
    while (this.scopeCreationCursor < this.scopeCreationOrder.length) {
      let ev = this.scopeCreationOrder[this.scopeCreationCursor];
      if (this.consumedCreations.has(ev.scopeId)) {
        // Already consumed (e.g., root was consumed directly)
        this.scopeCreationCursor++;
        continue;
      }
      return ev;
    }
    return undefined;
  }

  /**
   * Consume the current scope:created event.
   */
  consumeScopeCreation(scopeId: string): void {
    this.consumedCreations.add(scopeId);
    // Advance cursor past consumed events
    while (
      this.scopeCreationCursor < this.scopeCreationOrder.length &&
      this.consumedCreations.has(
        this.scopeCreationOrder[this.scopeCreationCursor].scopeId,
      )
    ) {
      this.scopeCreationCursor++;
    }
  }

  /**
   * Check if a specific scope has a recorded creation event.
   */
  hasScopeCreation(scopeId: string): boolean {
    return (
      this.scopeCreatedEvents.has(scopeId) &&
      !this.consumedCreations.has(scopeId)
    );
  }

  /**
   * Get the scope:created event for a specific scopeId.
   */
  getScopeCreation(
    scopeId: string,
  ): (DurableEvent & { type: "scope:created" }) | undefined {
    if (this.consumedCreations.has(scopeId)) return undefined;
    return this.scopeCreatedEvents.get(scopeId);
  }

  /**
   * Check if there are more scope creation events to replay.
   */
  get hasMoreCreations(): boolean {
    return this.peekScopeCreation() !== undefined;
  }

  // ── Scope destruction (per-scope lookup) ─────────────────────────

  /**
   * Check if a scope has a recorded destruction event.
   */
  hasScopeDestruction(scopeId: string): boolean {
    return (
      this.scopeDestroyedEvents.has(scopeId) &&
      !this.consumedDestructions.has(scopeId)
    );
  }

  /**
   * Consume the scope:destroyed event for a specific scope.
   */
  consumeScopeDestruction(scopeId: string): void {
    this.consumedDestructions.add(scopeId);
  }

  // ── Workflow return (per-scope lookup) ────────────────────────────

  /**
   * Check if a scope has a recorded workflow:return event.
   */
  hasWorkflowReturn(scopeId: string): boolean {
    return (
      this.workflowReturnEvents.has(scopeId) &&
      !this.consumedReturns.has(scopeId)
    );
  }

  /**
   * Consume the workflow:return event for a specific scope.
   */
  consumeWorkflowReturn(scopeId: string): void {
    this.consumedReturns.add(scopeId);
  }

  // ── Per-scope effect cursors ─────────────────────────────────────

  peekScopeEffect(scopeId: string): DurableEvent | undefined {
    let effects = this.scopeEffects.get(scopeId);
    if (!effects) return undefined;
    let cursor = this.scopeCursors.get(scopeId) ?? 0;
    if (cursor < effects.length) {
      return effects[cursor].event;
    }
    return undefined;
  }

  consumeScopeEffect(scopeId: string): void {
    let cursor = this.scopeCursors.get(scopeId) ?? 0;
    this.scopeCursors.set(scopeId, cursor + 1);
  }

  getScopeEffectOffset(scopeId: string): number {
    let effects = this.scopeEffects.get(scopeId);
    if (!effects) return -1;
    let cursor = this.scopeCursors.get(scopeId) ?? 0;
    if (cursor < effects.length) {
      return effects[cursor].offset;
    }
    return -1;
  }

  hasScopeEffects(scopeId: string): boolean {
    let effects = this.scopeEffects.get(scopeId);
    if (!effects) return false;
    let cursor = this.scopeCursors.get(scopeId) ?? 0;
    return cursor < effects.length;
  }

  getResolution(effectId: string): DurableEvent | undefined {
    return this.resolutions.get(effectId);
  }
}

/**
 * DurableReducer replaces Effection's built-in Reducer.
 *
 * It is duck-typed to match the Reducer interface:
 *   - `reducing: boolean`
 *   - `reduce(instruction: Instruction): void`
 *
 * On the live path, it delegates to effect.enter() and records
 * resolutions to the DurableStream. On the replay path, it reads
 * stored results and feeds them back without calling enter().
 *
 * Phase 5: Uses per-scope cursors and per-scope lifecycle lookups
 * for replay to handle concurrent interleaving correctly.
 */
export class DurableReducer {
  reducing = false;
  readonly queue = new InstructionQueue();

  private replayIndex: ReplayIndex;
  private scopeIds = new WeakMap<Scope, string>();
  private scopeParents = new Map<string, string | undefined>();
  private scopeOrdinal = 0;
  private effectCounter: number;

  readonly stream: DurableStream;

  constructor(stream: DurableStream) {
    this.stream = stream;
    // Seed counter from stream length so new effect IDs never collide
    // with existing entries after a process restart.
    this.effectCounter = stream.length;
    this.replayIndex = new ReplayIndex(stream.read(0), (desc) =>
      this.isInfrastructureEffect(desc),
    );
  }

  private nextEffectId(): string {
    return `effect-${++this.effectCounter}`;
  }

  private nextScopeId(): string {
    return `scope-${++this.scopeOrdinal}`;
  }

  getScopeId(scope: Scope): string {
    let id = this.scopeIds.get(scope);
    if (!id) {
      throw new Error(
        "DurableReducer: scope not registered. This indicates a lifecycle bug — " +
          "the scope was not created through the durable middleware.",
      );
    }
    return id;
  }

  private registerScope(scope: Scope, id: string, parentId?: string): void {
    this.scopeIds.set(scope, id);
    this.scopeParents.set(id, parentId);
  }

  getParentScopeId(scopeId: string): string | undefined {
    return this.scopeParents.get(scopeId);
  }

  private unregisterScope(scope: Scope): void {
    let id = this.scopeIds.get(scope);
    if (id) this.scopeParents.delete(id);
    this.scopeIds.delete(scope);
  }

  createScopeMiddleware(runScope: Scope) {
    this.registerScope(runScope, "root");

    // Record or consume scope:created for the root scope
    if (this.replayIndex.hasScopeCreation("root")) {
      this.replayIndex.consumeScopeCreation("root");
    } else {
      this.stream.append({
        type: "scope:created",
        scopeId: "root",
      });
    }

    let reducer = this;

    // Track whether root's scope:destroyed has been emitted, to
    // prevent double-recording.
    let rootDestroyedEmitted = false;

    return {
      create(
        args: [Scope],
        next: (parent: Scope) => [Scope, () => Operation<void>],
      ) {
        let [parent] = args;
        let parentScopeId = reducer.scopeIds.get(parent);

        let [child, destroy] = next(parent);

        // Check if the next scope creation in the replay matches
        let ev = reducer.replayIndex.peekScopeCreation();
        if (ev) {
          // Validate parent relationship
          if (parentScopeId && ev.parentScopeId !== parentScopeId) {
            throw new DivergenceError(
              `scope:created with parent ${ev.parentScopeId}`,
              `scope:created with parent ${parentScopeId}`,
              -1,
            );
          }
          reducer.registerScope(child, ev.scopeId, parentScopeId);
          reducer.replayIndex.consumeScopeCreation(ev.scopeId);
        } else {
          // Live path: assign ID and record
          let scopeId = reducer.nextScopeId();
          reducer.registerScope(child, scopeId, parentScopeId);
          reducer.stream.append({
            type: "scope:created",
            scopeId,
            parentScopeId,
          });
        }

        return [child, destroy] as [Scope, () => Operation<void>];
      },

      *destroy(args: [Scope], next: (scope: Scope) => Operation<void>) {
        let [scope] = args;
        let scopeId = reducer.scopeIds.get(scope);

        let outcome: { ok: true } | { ok: false; error: SerializedError } = {
          ok: true,
        };
        try {
          yield* next(scope);
        } catch (error) {
          outcome = {
            ok: false,
            error: serializeError(normalizeError(error)),
          };
          throw error;
        } finally {
          if (scopeId) {
            // Capture parent ID before unregistering (unregister
            // deletes the parent mapping).
            let parentId = reducer.getParentScopeId(scopeId);

            // Emit workflow:return before scope:destroyed
            reducer.emitWorkflowReturn(scope, scopeId);

            if (reducer.replayIndex.hasScopeDestruction(scopeId)) {
              reducer.replayIndex.consumeScopeDestruction(scopeId);
            } else {
              reducer.stream.append({
                type: "scope:destroyed",
                scopeId,
                result: outcome,
              });
            }
            reducer.unregisterScope(scope);

            // When a direct child of root is destroyed, the root
            // scope is shutting down. Record root's lifecycle events
            // here — synchronously within the scope's structured
            // teardown — so they happen before any parent resource
            // cleanup (e.g., useDurableStream closing the stream).
            //
            // This replaces the previous .then() microtask approach
            // which raced against resource cleanup.
            if (
              reducer.scopeIds.get(runScope) === "root" &&
              !rootDestroyedEmitted
            ) {
              if (parentId === "root") {
                rootDestroyedEmitted = true;

                // Determine root's outcome from the child scope's
                // delimiter. The `outcome` variable reflects cleanup
                // success, not the task's result — a workflow can
                // error but its cleanup succeeds. We need to check
                // the delimiter to know if the workflow returned or
                // errored.
                let rootOutcome = reducer.getRootOutcome(scope, outcome);

                // Root's workflow:return — only if the workflow
                // completed successfully (not on error/halt)
                if (rootOutcome.ok) {
                  reducer.emitWorkflowReturn(scope, "root");
                }

                if (reducer.replayIndex.hasScopeDestruction("root")) {
                  reducer.replayIndex.consumeScopeDestruction("root");
                } else {
                  reducer.stream.append({
                    type: "scope:destroyed",
                    scopeId: "root",
                    result: rootOutcome,
                  });
                }
              }
            }
          }
        }
      },

      set(
        args: [Scope, Context<unknown>, unknown],
        next: (
          scope: Scope,
          context: Context<unknown>,
          value: unknown,
        ) => unknown,
      ) {
        let [scope, context, value] = args;
        let result = next(scope, context, value);

        let scopeId = reducer.scopeIds.get(scope);
        if (scopeId && !isInfrastructureContext(context.name)) {
          // Only record in live mode (not during replay of this scope)
          if (
            !reducer.replayIndex.hasScopeEffects(scopeId) &&
            !reducer.replayIndex.hasScopeDestruction(scopeId)
          ) {
            reducer.stream.append({
              type: "scope:set",
              scopeId,
              contextName: context.name,
              value: toJson(value),
            });
          }
        }

        return result;
      },

      delete(
        args: [Scope, Context<unknown>],
        next: (scope: Scope, context: Context<unknown>) => boolean,
      ) {
        let [scope, context] = args;
        let result = next(scope, context);

        let scopeId = reducer.scopeIds.get(scope);
        if (scopeId && !isInfrastructureContext(context.name)) {
          if (
            !reducer.replayIndex.hasScopeEffects(scopeId) &&
            !reducer.replayIndex.hasScopeDestruction(scopeId)
          ) {
            reducer.stream.append({
              type: "scope:delete",
              scopeId,
              contextName: context.name,
            });
          }
        }

        return result;
      },
    };
  }

  /**
   * Determine the root scope's outcome from the child scope's delimiter.
   *
   * The middleware `destroy` handler's `outcome` reflects whether cleanup
   * succeeded, not whether the workflow returned or errored. A workflow
   * that throws an error can still have successful cleanup (outcome.ok
   * is true). We check the child scope's DelimiterContext to determine
   * the actual workflow result.
   */
  getRootOutcome(
    childScope: Scope,
    cleanupOutcome: { ok: true } | { ok: false; error: SerializedError },
  ): { ok: true } | { ok: false; error: SerializedError } {
    // If cleanup itself failed, that's the outcome
    if (!cleanupOutcome.ok) return cleanupOutcome;

    // Check the child scope's delimiter for the workflow result
    let delimiter = childScope.get(DelimiterContext);
    if (delimiter?.computed && delimiter.outcome?.exists) {
      let delimOutcome = delimiter.outcome.value;
      if (!delimOutcome.ok) {
        return {
          ok: false,
          error: serializeError(delimOutcome.error),
        };
      }
    }

    return { ok: true };
  }

  emitWorkflowReturn(scope: Scope, scopeId: string): void {
    let delimiter = scope.get(DelimiterContext);
    if (
      !delimiter?.computed ||
      !delimiter.outcome?.exists ||
      !delimiter.outcome.value.ok
    ) {
      return;
    }

    let returnValue = delimiter.outcome.value.value;

    if (this.replayIndex.hasWorkflowReturn(scopeId)) {
      this.replayIndex.consumeWorkflowReturn(scopeId);
    } else {
      this.stream.append({
        type: "workflow:return",
        scopeId,
        value: toJson(returnValue),
      });
    }
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
            // DivergenceError is a fatal infrastructure error that must
            // propagate immediately. It cannot go through the normal
            // instruction queue because the Delimiter validator may
            // drop it during replay (the scope finalizes synchronously
            // before the error instruction is dequeued).
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

    // Infrastructure effects always execute live — they don't need
    // scope registration because they are never recorded or replayed.
    // Check this first because infrastructure effects may fire on
    // scopes that were already unregistered during teardown, or on
    // the scoped() scope itself which sits outside the durable scope
    // tree (e.g., when awaiting the spawned task result).
    if (this.isInfrastructureEffect(description)) {
      routine.data.exit = effect.enter(routine.next, routine);
      return;
    }

    let effectId = this.nextEffectId();
    let shouldRecordYielded = true;

    let scopeId = this.scopeIds.get(routine.scope);
    if (!scopeId) {
      // The scope was unregistered during teardown. Effects that fire
      // after scope destruction (e.g., cleanup in finally blocks)
      // execute live — there is nothing to record or replay.
      routine.data.exit = effect.enter(routine.next, routine);
      return;
    }

    // Check if we can replay this effect (per-scope cursor)
    let replayEvent = this.replayIndex.peekScopeEffect(scopeId);

    if (replayEvent && replayEvent.type === "effect:yielded") {
      // Divergence detection
      if (replayEvent.description !== description) {
        throw new DivergenceError(
          replayEvent.description,
          description,
          this.replayIndex.getScopeEffectOffset(scopeId),
        );
      }

      effectId = replayEvent.effectId;
      this.replayIndex.consumeScopeEffect(scopeId);

      let resolutionEvent = this.replayIndex.getResolution(effectId);

      if (resolutionEvent && resolutionEvent.type === "effect:resolved") {
        let result: Result<unknown> = Ok(resolutionEvent.value);
        routine.data.exit = (resolve) => resolve(Ok());
        routine.next(result);
        return;
      }

      if (resolutionEvent && resolutionEvent.type === "effect:errored") {
        let error = deserializeError(resolutionEvent.error);
        let result: Result<unknown> = Err(error);
        routine.data.exit = (resolve) => resolve(Ok());
        routine.next(result);
        return;
      }

      // Resolution missing — run live and record only the missing
      // resolution for the existing effectId (do not re-record yielded).
      shouldRecordYielded = false;
    }

    // Live path: record and execute
    if (shouldRecordYielded) {
      this.stream.append({
        type: "effect:yielded",
        scopeId,
        effectId,
        description,
      });
    }

    let originalNext = routine.next.bind(routine);
    let stream = this.stream;

    // Single-invocation invariant: Effection's effect protocol guarantees
    // each effect is resolved exactly once (each yield corresponds to a
    // single resolution). wrappedNext records the result then restores
    // routine.next to originalNext so subsequent calls bypass the wrapper.
    let wrappedNext = (result: Result<unknown>) => {
      if (result.ok) {
        stream.append({
          type: "effect:resolved",
          effectId,
          value: toJson(result.value),
        });
      } else {
        stream.append({
          type: "effect:errored",
          effectId,
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
      // Restore original next if enter() throws synchronously,
      // so the coroutine isn't left with a stale wrapper.
      routine.next = originalNext;
      throw e;
    }
  }
}

function isInfrastructureContext(name: string): boolean {
  if (name.startsWith("api::")) return true;
  return INFRASTRUCTURE_CONTEXTS.has(name);
}
