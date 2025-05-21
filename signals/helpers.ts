import { each, type Operation } from "effection";
import type { ValueSignal } from "./types.ts";

/**
 * Returns an operation that will wait until the value of the stream matches the predicate.
 * @param stream - The stream to check.
 * @param predicate - The predicate to check the value against.
 * @returns An operation that will wait until the value of the stream matches the predicate.
 */
export function* is<T>(
  stream: ValueSignal<T>,
  predicate: (item: T) => boolean,
): Operation<void> {
  const result = predicate(stream.valueOf());
  if (result) {
    return;
  }
  for (const value of yield* each(stream)) {
    const result = predicate(value);
    if (result) {
      return;
    }
    yield* each.next();
  }
}
