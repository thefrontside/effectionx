import { map } from "@effectionx/stream-helpers";
import type { Hierarchy, NodeMap, Transform } from "./types.ts";

export function stratify(): Transform<NodeMap, Hierarchy> {
  return map(function* (nodes) {
    let stratii = new Map<string, Hierarchy>();

    let root: Hierarchy = {
      id: "root",
      data: {},
      children: [],
    };

    let orphans: Hierarchy = {
      id: "orphans",
      data: {},
      children: [],
    };

    root.children.push(orphans);

    stratii.set(root.id, root);

    for (let [id, node] of Object.entries(nodes)) {
      let stratum = stratii.get(id);
      if (!stratum) {
        stratii.set(
          id,
          (stratum = {
            id,
            data: node.data,
            children: [],
          }),
        );
      }
      if (node.parentId === "global") {
        root.children.push(stratum);
      } else {
        let parent = stratii.get(node.parentId) ?? orphans;
        parent.children.push(stratum);
      }
    }

    return root;
  });
}
