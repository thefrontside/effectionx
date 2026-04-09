import type { Operation } from "effection";

import { createValueSignal } from "./value.ts";
import type { ValueSignal } from "./types.ts";

/**
 * A value signal specialized for boolean state.
 */
export interface BooleanSignal extends ValueSignal<boolean> {}

/**
 * Creates a boolean signal backed by the shared value-signal implementation.
 *
 * @param initial - Initial boolean value.
 * @returns A boolean signal resource.
 */
export function createBooleanSignal(initial = false): Operation<BooleanSignal> {
  return createValueSignal(initial);
}
