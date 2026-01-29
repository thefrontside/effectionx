import type { Hierarchy } from "./types";

export const LABEL_ATTRIBUTE = "@effectionx/inspector.labels";

export function getNodeLabel(node: Hierarchy): string {
  const inspectorLabels = (
    node?.data && LABEL_ATTRIBUTE in node.data ? node.data[LABEL_ATTRIBUTE] : {}
  ) as Record<string, unknown>;
  const label = String(inspectorLabels?.name ?? node.id);
  return label === "anonymous" ? `${label} [${node.id}]` : label;
}
