import type { Hierarchy } from "../data/types.ts";
import type { Stratification } from "../data/stratify.ts";
import { getNodeLabel } from "../data/labels.ts";

export function TreeView({
  hierarchy,
  slot,
}: {
  hierarchy: Hierarchy | Stratification;
  slot?: string;
}) {
  const root = hierarchy && "root" in hierarchy ? hierarchy.root : hierarchy;

  return (
    <sl-tree slot={slot}>
      <TreeNode hierarchy={root} />
    </sl-tree>
  );
}

export function TreeNode({ hierarchy }: { hierarchy: Hierarchy }): Element {
  return (
    <sl-tree-item key={hierarchy.id} selection="single" data-id={hierarchy.id}>
      {getNodeLabel(hierarchy)}
      {hierarchy.children.map((h) => (
        <TreeNode hierarchy={h} />
      ))}
    </sl-tree-item>
  );
}
