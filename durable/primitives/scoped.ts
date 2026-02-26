import type { Operation } from "effection";
import { scoped as effectionScoped } from "effection";
import { type DurableOperation, asDurable } from "../types.ts";

/**
 * Encapsulate a durable operation so no effects persist outside of it.
 *
 * All active effects (concurrent tasks, resources) are shut down when
 * the scoped operation completes. The teardown is recorded in the
 * durable stream.
 *
 * @param op - the durable operation to encapsulate
 * @returns the scoped durable operation
 */
export function scoped<T>(op: () => DurableOperation<T>): DurableOperation<T> {
  return asDurable(effectionScoped(op as () => Operation<T>));
}
