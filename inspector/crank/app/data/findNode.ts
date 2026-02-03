import type { Hierarchy } from "./types";

export function findNode(
  root: Hierarchy | undefined,
  id: string | undefined,
): Hierarchy | undefined {
  if (!root || !id) return undefined;
  const stack: Hierarchy[] = [root];
  while (stack.length) {
    const popped = stack.pop();
    if (!popped) break;
    const current = popped;
    if (current.id === id) return current;
    for (const c of current.children ?? []) {
      stack.push(c);
    }
  }
  return undefined;
}
