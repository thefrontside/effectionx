import type { Operation } from "effection";

import { createValueSignal } from "./value.ts";
import type { ValueSignal } from "./types.ts";

export interface BooleanSignal extends ValueSignal<boolean> {}

export function createBooleanSignal(initial = false): Operation<BooleanSignal> {
  return createValueSignal(initial);
}
