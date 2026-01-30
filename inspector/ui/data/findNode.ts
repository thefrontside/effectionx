import type { Hierarchy } from "./types";

export function findNode(
  root: Hierarchy | undefined,
  id: string | undefined,
): Hierarchy | undefined {
  if (!root || !id) return undefined;
  const stack: Hierarchy[] = [root];
  while (stack.length) {
    const current = stack.pop()!;
    if (current.id === id) return current;
    for (const c of current.children ?? []) {
      stack.push(c);
    }
  }
  return undefined;
}
