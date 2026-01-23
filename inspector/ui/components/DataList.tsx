import { useSelector as useSel } from "starfx/react";
import type { AppState } from "../store/schema";
import {
  TreeView,
  TreeViewItem,
  TreeViewItemContent,
} from "@react-spectrum/s2";
import * as d3 from "d3";

const useSelector = useSel.withTypes<AppState>();

import {
  type EffectionStateNode,
  treeAtTick,
} from "../store/selector/data-tree";

export function DataList({ tick }: { tick: number }) {
  const data = useSelector((s: AppState) => treeAtTick(s, tick));

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

  return data.length === 0 ? null : (
    <TreeView aria-label="Inspect Tree">{renderNode(data)}</TreeView>
  );
}
