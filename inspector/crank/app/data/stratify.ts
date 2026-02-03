import { map } from "@effectionx/stream-helpers";
import type { Hierarchy, NodeMap, Transform } from "./types.ts";

export type HierarchyMap = Record<string, Hierarchy>;

export interface Stratification {
  root: Hierarchy;
  nodes: NodeMap;
  hierarchies: HierarchyMap;
}

export function stratify(): Transform<NodeMap, Stratification> {
  return map(function* (nodes) {
    let stratii = new Map<string, Hierarchy>();

    let rootId: string | undefined = undefined;

    for (let [id, node] of Object.entries(nodes)) {
      let stratum = stratii.get(id);
      if (!stratum) {
        const s: Hierarchy = {
          id,
          parentId: node.parentId,
          data: node.data,
          children: [],
        };
        stratii.set(id, s);
        stratum = s;
      } else {
        // ensure parentId/data are set if this record was created earlier
        stratum.parentId = node.parentId;
        stratum.data = node.data;
      }
      if (!node.parentId) {
        if (typeof rootId === "string") {
          let current = stratii.get(rootId);
          throw new TypeError(
            `duplicate roots: [${JSON.stringify(current)}, ${JSON.stringify(node)}]`,
          );
        }
        rootId = node.id;
      } else {
        let parent = stratii.get(node.parentId);
        if (!parent) {
          console.warn(`unknown parent id: ${node.parentId}`);
        } else {
          parent.children.push(stratum);
        }
      }
    }

    if (!rootId) {
      throw new TypeError("Hierarchy did not contain a root node");
    }

    const root = stratii.get(rootId as string);
    if (!root) {
      throw new TypeError("Hierarchy did not contain a root node");
    }

    let hierarchies = Object.fromEntries(stratii.entries());
    return { root, nodes, hierarchies };
  });
}
