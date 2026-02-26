import type { Task } from "effection";
import { spawn as effectionSpawn } from "effection";
import { type DurableOperation, asDurable } from "../types.ts";

/**
 * Spawn a durable child coroutine concurrently.
 *
 * The reducer's scope middleware automatically emits a `spawn` event
 * before the child begins execution, and a `close` event when it
 * terminates. During replay, the child's coroutine ID is restored
 * from the recorded `spawn` event.
 *
 * @param op - the durable operation to run as a child
 * @returns a {@link Task} representing the running child coroutine
 */
export function spawn<T>(
  op: () => DurableOperation<T>,
): DurableOperation<Task<T>> {
  return asDurable(effectionSpawn(op));
}
