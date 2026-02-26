import type { Operation, Yielded } from "effection";
import { all as effectionAll } from "effection";
import { type DurableOperation, asDurable } from "../types.ts";

/**
 * Block and wait for all of the given durable operations to complete.
 *
 * Returns an array of values that the given operations evaluated to.
 * All branch close events are recorded before the join resolution
 * (runtime invariant #4).
 *
 * @param ops - a list of durable operations to wait for
 * @returns the list of values in order
 */
export function all<T extends readonly DurableOperation<unknown>[] | []>(
  ops: T,
): DurableOperation<{ -readonly [P in keyof T]: Yielded<T[P]> }> {
  return asDurable(
    effectionAll(ops as T & readonly Operation<unknown>[]),
  ) as DurableOperation<{ -readonly [P in keyof T]: Yielded<T[P]> }>;
}
