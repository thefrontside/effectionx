import type { Hierarchy } from "../data/types.ts";
import { getNodeLabel } from "../data/labels.ts";
import { Details } from "./hierarchy-details.tsx";
import type { Stratification } from "../data/stratify.ts";
import type { Context } from "@b9g/crank";
import { Graphic } from "./graphic.tsx";

export interface StructureInspectorProps {
  structure?: Stratification;
}

export function* StructureInspector(
  this: Context<StructureInspectorProps>,
  { structure = initialStructure() }: StructureInspectorProps,
): Generator<Element> {
  let selection: Hierarchy | undefined = undefined;

  this.addEventListener("sl-selection-change", (e) => {
    let [item] = e.detail.selection;
    let id = item.dataset.id!;
    this.refresh(() => (selection = structure.hierarchies[id]!));
  });

  for ({ structure = initialStructure() } of this) {
    selection = selection ?? structure.root;

    yield (
      <sl-split-panel position="70">
        <TreeView slot="start" root={structure.root} selection={selection} />
        <Details slot="end" node={selection} />
      </sl-split-panel>
    );
  }
}

export function TreeView({
  root,
  selection,
  slot,
}: {
  root: Hierarchy;
  selection: Hierarchy;
  slot?: string;
}) {
  return (
    <sl-tab-group slot={slot}>
      <sl-tab slot="nav" panel="tree">
        Tree
      </sl-tab>
      <sl-tab slot="nav" panel="graphic">
        Graphic
      </sl-tab>
      <sl-tab-panel name="tree">
        <sl-tree>
          <TreeNode hierarchy={root} selection={selection} />
        </sl-tree>
      </sl-tab-panel>
      <sl-tab-panel name="graphic">
        <Graphic hierarchy={root} selection={selection} />
      </sl-tab-panel>
    </sl-tab-group>
  );
}

export function TreeNode({
  hierarchy,
  selection,
}: {
  hierarchy: Hierarchy;
  selection: Hierarchy;
}): Element {
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

export function initialStructure(): Stratification {
  let root: Hierarchy = {
    children: [],
    id: "0",
    data: {
      "@effection/attributes": { name: "Global" },
    },
  };

  return {
    root,
    hierarchies: { [root.id]: root },
  };
}
