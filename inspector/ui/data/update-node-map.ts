import type { ScopeEvent } from "../../scope/protocol.ts";
import type { NodeMap, Transform } from "./types.ts";
import { reduce } from "../../lib/reduce.ts";

export function updateNodeMap(
  initial: NodeMap,
): Transform<ScopeEvent, NodeMap> {
  return reduce(function* (nodemap, item) {
    if (item.type === "created") {
      nodemap[item.id] = {
        id: item.id,
        parentId: item.parentId,
        data: {},
      };
    }
    if (item.type === "destroyed") {
      delete nodemap[item.id];
    }
    if (item.type === "set") {
      nodemap[item.id].data[item.contextName] = item.contextValue;
    }
    return nodemap;
  }, initial);
}
