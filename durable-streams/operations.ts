/**
 * Workflow-enabled effects — durable equivalents of Effection's built-in
 * operations.
 *
 * Each returns a Workflow<T> (a generator that yields a single DurableEffect).
 * These are the building blocks for durable workflows.
 *
 * See integration doc §6.
 */

import { call } from "effection";
import type { Operation } from "effection";
import { createDurableEffect, createDurableOperation } from "./effect.ts";
import type { Json, Workflow } from "./types.ts";

/**
 * Durable sleep — pauses the workflow for `ms` milliseconds.
 *
 * During replay, resolves synchronously with the stored result.
 * During live execution, uses setTimeout and persists the Yield event.
 *
 * Description: { type: "sleep", name: "sleep" }
 */
export function* durableSleep(ms: number): Workflow<void> {
  yield createDurableEffect<void>(
    { type: "sleep", name: "sleep" },
    (resolve) => {
      const id = setTimeout(() => resolve({ status: "ok" }), ms);
      return () => clearTimeout(id);
    },
  );
}

/**
 * Durable call — wraps a function for durable execution.
 *
 * Accepts functions returning either a Promise or an Operation.
 * Effection's call() handles the dispatch at runtime: Promises are
 * bridged, Operations run with full structured concurrency.
 *
 * The function is called during live execution; its resolved value is
 * serialized and persisted. During replay, the stored value is returned
 * without calling the function.
 *
 * Description: { type: "call", name }
 *
 * IMPORTANT: The function's return value must be JSON-serializable.
 *
 * @param name Stable identifier for the effect (used for divergence detection)
 * @param fn Function returning a Promise or Operation (only called during live execution)
 */
export function* durableCall<T extends Json>(
  name: string,
  fn: () => Promise<T> | Operation<T>,
): Workflow<T> {
  // call() dispatches at runtime: if fn() returns a Promise, it bridges
  // via action(); if it returns an Operation, it evaluates directly.
  // The cast is safe because call() always resolves to T regardless of
  // which branch fn() takes.
  return (yield createDurableOperation<T>(
    { type: "call", name },
    // biome-ignore lint/suspicious/noExplicitAny: fn returns Promise<T> | Operation<T>, call() accepts both
    () => call(fn as any) as Operation<T>,
  )) as T;
}

/**
 * Durable action — generic effect with a custom executor.
 *
 * Like Effection's action(), but durable. The executor receives resolve/reject
 * callbacks and returns a teardown function.
 *
 * Description: { type: "action", name }
 */
export function* durableAction<T extends Json>(
  name: string,
  executor: (
    resolve: (value: T) => void,
    reject: (error: Error) => void,
  ) => () => void,
): Workflow<T> {
  return (yield createDurableEffect<T>(
    { type: "action", name },
    (protocolResolve, reject) => {
      return executor(
        (value: T) => protocolResolve({ status: "ok", value: value as Json }),
        reject,
      );
    },
  )) as T;
}

/**
 * Version gate — enables safe code evolution for durable workflows.
 *
 * During live execution, resolves with `maxVersion`. During replay, the
 * stored version determines which code path the workflow takes.
 *
 * Description: { type: "version_gate", name }
 *
 * See spec §9.
 */
export function* versionCheck(
  name: string,
  opts: { minVersion: number; maxVersion: number },
): Workflow<number> {
  if (opts.minVersion > opts.maxVersion) {
    throw new Error(
      `versionCheck("${name}"): minVersion (${opts.minVersion}) ` +
        `cannot exceed maxVersion (${opts.maxVersion})`,
    );
  }

  const version = (yield createDurableEffect<number>(
    { type: "version_gate", name },
    (resolve) => {
      resolve({ status: "ok", value: opts.maxVersion });
      return () => {};
    },
  )) as number;

  if (version < opts.minVersion || version > opts.maxVersion) {
    throw new Error(
      `versionCheck("${name}"): replayed version ${version} is outside ` +
        `supported range [${opts.minVersion}, ${opts.maxVersion}]`,
    );
  }

  return version;
}
