import { createContext } from "effection";
import type { ParentContextValue } from "./types.ts";

export const StateParentContext = createContext<ParentContextValue<unknown>>(
  "parent-state",
  { initial: undefined, update: function* () {} },
);

export function* useStateParent<T>() {
  return (yield* StateParentContext.expect()) as ParentContextValue<T>;
}
