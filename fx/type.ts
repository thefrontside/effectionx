import type { Instruction } from "effection";
export interface Computation<T = unknown> {
  // biome-ignore lint/suspicious/noExplicitAny: Iterator requires any for yield expressions
  [Symbol.iterator](): Iterator<Instruction, T, any>;
}
