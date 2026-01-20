import { type TypedUseSelectorHook, useSelector as useSel } from "starfx/react";
import type { AppState } from "../store/schema";
import {
  TreeView,
  TreeViewItem,
  TreeViewItemContent,
} from "@react-spectrum/s2";
import * as d3 from "d3";

const useSelector: TypedUseSelectorHook<AppState> = useSel;

import {
  type EffectionStateNode,
  nodeAtTick,
} from "../store/selector/data-tree";

export function DataList({ tick }: { tick: number }) {
  const data = useSelector((s: AppState) => nodeAtTick(s, tick));

  const roots = d3
    .stratify<EffectionStateNode>()
    .id((d) => d.id)
    .parentId((d) => d.parentId)(data);
  console.log(roots);

  function renderNode(item: d3.HierarchyNode<EffectionStateNode>) {
    const value = `${item.data.id} [${item.data.current}]`;

    return (
      <TreeViewItem
        key={item.id}
        id={item.id}
        textValue={value}
        hasChildItems={Boolean(item.children?.length)}
      >
        <TreeViewItemContent>{value}</TreeViewItemContent>
        {item.children?.map(renderNode)}
      </TreeViewItem>
    );
  }

  return <TreeView aria-label="Inspect Tree">{renderNode(roots)}</TreeView>;
}
