import type { Operation, Provide } from "effection";
import { resource as effectionResource } from "effection";
import { type DurableOperation, asDurable } from "../types.ts";

/**
 * Define a durable resource with acquire/release lifecycle.
 *
 * The resource's acquire and release are recorded deterministically.
 * During replay, already-recorded acquisitions are not re-executed
 * (runtime invariant #3).
 *
 * @param op - the operation defining the resource lifecycle
 * @returns a durable operation yielding the resource
 */
export function resource<T>(
  op: (provide: Provide<T>) => DurableOperation<void>,
): DurableOperation<T> {
  return asDurable(
    effectionResource(op as (provide: Provide<T>) => Operation<void>),
  );
}
