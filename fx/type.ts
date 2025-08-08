import type { Instruction } from "effection";
export interface Computation<T = unknown> {
  // deno-lint-ignore no-explicit-any
  [Symbol.iterator](): Iterator<Instruction, T, any>;
}
