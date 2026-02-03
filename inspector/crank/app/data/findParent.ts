import type { Hierarchy } from "./types";

export function findParent(
  root: Hierarchy | undefined,
  childId: string | undefined,
): Hierarchy | undefined {
  if (!root || !childId) return undefined;
  let stack: Hierarchy[] = [root];
  while (stack.length) {
    const popped = stack.pop();
    if (!popped) break;
    const current = popped;
    for (const c of current.children ?? []) {
      if (c.id === childId) return current;
      stack.push(c);
    }
  }
  return undefined;
}
