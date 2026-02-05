import type { Hierarchy } from "../data/types.ts";
import { getNodeLabel } from "../data/labels.ts";

export function TreeView({
  hierarchy,
  selection,
  slot,
}: {
  hierarchy: Hierarchy;
  selection: Hierarchy;
  slot?: string;
}) {
  return (
    <sl-tree slot={slot}>
      <TreeNode hierarchy={hierarchy} selection={selection} />
    </sl-tree>
  );
}

export function TreeNode({
  hierarchy,
  selection,
}: { hierarchy: Hierarchy; selection: Hierarchy }): Element {
  let selected = hierarchy.id === selection.id;
  return (
    <sl-tree-item
      key={hierarchy.id}
      selection="single"
      data-id={hierarchy.id}
      selected={selected}
    >
      {getNodeLabel(hierarchy)}
      {hierarchy.children.map((h) => (
        <TreeNode hierarchy={h} selection={selection} />
      ))}
    </sl-tree-item>
  );
}
