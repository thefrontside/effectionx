/**
 * Durable resolve — persistent, replay-safe non-deterministic value capture.
 *
 * Uses `createDurableOperation` from @effectionx/durable-streams.
 * During live execution, the operation runs and persists a Yield event.
 * During replay, the stored result is returned without executing.
 */

import {
  type Json,
  type Workflow,
  createDurableOperation,
} from "@effectionx/durable-streams";
import { useScope } from "effection";
import type { Operation } from "effection";
import { type DurableRuntime, DurableRuntimeCtx } from "./runtime.ts";

export type ResolveKind =
  | { kind: "current_time" }
  | { kind: "random_float"; min?: number; max?: number }
  | { kind: "random_int"; min: number; max: number }
  | { kind: "uuid" }
  | { kind: "env_var"; name: string }
  | { kind: "platform" };

/**
 * Capture a non-deterministic value once durably.
 *
 * On replay, return the stored value without re-executing.
 * Custom resolver returns Operation<T>, not Promise<T>.
 */
export function* durableResolve<T extends Json>(
  name: string,
  resolver: ResolveKind | (() => Operation<T>),
): Workflow<T> {
  const isKind = typeof resolver === "object" && "kind" in resolver;
  const descExtras: Record<string, Json> = {};
  if (isKind) {
    descExtras.kind = resolver.kind;
    if (resolver.kind === "env_var") descExtras.varName = resolver.name;
    if (resolver.kind === "random_float") {
      descExtras.min = resolver.min ?? 0;
      descExtras.max = resolver.max ?? 1;
    }
    if (resolver.kind === "random_int") {
      if (resolver.min > resolver.max) {
        throw new Error(
          `durableResolve("${name}"): random_int min (${resolver.min}) ` +
            `cannot exceed max (${resolver.max})`,
        );
      }
      if (!Number.isInteger(resolver.min) || !Number.isInteger(resolver.max)) {
        throw new Error(
          `durableResolve("${name}"): random_int min and max must be integers`,
        );
      }
      descExtras.min = resolver.min;
      descExtras.max = resolver.max;
    }
  }

  return (yield createDurableOperation<Json>(
    { type: "resolve", name, ...descExtras },
    function* () {
      if (typeof resolver === "function") {
        return (yield* resolver()) as unknown as Json;
      }

      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      switch (resolver.kind) {
        case "current_time":
          return new Date().toISOString() as unknown as Json;
        case "random_float": {
          const min = resolver.min ?? 0;
          const max = resolver.max ?? 1;
          return (Math.random() * (max - min) + min) as unknown as Json;
        }
        case "random_int": {
          const range = resolver.max - resolver.min + 1;
          return (Math.floor(Math.random() * range) +
            resolver.min) as unknown as Json;
        }
        case "uuid":
          return crypto.randomUUID() as unknown as Json;
        case "env_var":
          return (runtime.env(resolver.name) ?? null) as unknown as Json;
        case "platform":
          return runtime.platform() as unknown as Json;
      }
    },
  )) as T;
}

// ---------------------------------------------------------------------------
// Convenience wrappers
// ---------------------------------------------------------------------------

/** Capture the current time as ISO-8601 string. */
export function* durableNow(name?: string): Workflow<string> {
  return yield* durableResolve(name ?? "now", { kind: "current_time" });
}

/** Capture a random UUID. */
export function* durableUUID(name?: string): Workflow<string> {
  return yield* durableResolve(name ?? "uuid", { kind: "uuid" });
}

/**
 * Capture an environment variable value.
 *
 * **Security warning**: The env var *value* is persisted to the durable
 * journal. Do NOT use this for secrets (API keys, tokens, passwords).
 * For secrets, read them ephemerally on each run instead.
 */
export function* durableEnv(
  varName: string,
  name?: string,
): Workflow<string | null> {
  return yield* durableResolve(name ?? `env:${varName}`, {
    kind: "env_var",
    name: varName,
  });
}
