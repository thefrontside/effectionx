import type { Hierarchy } from "./types";

export function findParent(
  root: Hierarchy | undefined,
  childId: string | undefined,
): Hierarchy | undefined {
  if (!root || !childId) return undefined;
  let stack: Hierarchy[] = [root];
  while (stack.length) {
    const current = stack.pop()!;
    for (const c of current.children ?? []) {
      if (c.id === childId) return current;
      stack.push(c);
    }
  }
  return undefined;
}
