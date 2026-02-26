import type { Operation, Yielded } from "effection";
import { race as effectionRace } from "effection";
import { type DurableOperation, asDurable } from "../types.ts";

/**
 * Race the given durable operations against each other.
 *
 * Returns the value of whichever operation returns first. The winner's
 * `close(ok)` is recorded followed by `close(cancelled)` for each
 * loser (runtime invariant #5).
 *
 * @param ops - a list of durable operations to race
 * @returns the value of the fastest operation
 */
export function race<T extends readonly DurableOperation<unknown>[]>(
  ops: T,
): DurableOperation<Yielded<T[number]>> {
  return asDurable(
    effectionRace(ops as T & readonly Operation<unknown>[]),
  ) as DurableOperation<Yielded<T[number]>>;
}
