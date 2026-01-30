import type React from "react";
import { useEffect } from "react";
import {
  TreeView,
  TreeViewItem,
  TreeViewItemContent,
  Text,
} from "@react-spectrum/s2";
import type { Hierarchy } from "../data/types";
import "./HierarchyTree.css";
import Checkmark from "@react-spectrum/s2/icons/Checkmark";
import AlertTriangle from "@react-spectrum/s2/icons/AlertTriangle";
import Play from "@react-spectrum/s2/icons/Play";
import ClockPending from "@react-spectrum/s2/icons/ClockPending";
import Circle from "@react-spectrum/s2/icons/Circle";
import { iconStyle } from "@react-spectrum/s2/style" with { type: "macro" };

import { getNodeLabel } from "../data/labels";
import { useParams, useNavigate } from "react-router";

function getOperationKind(_node: Hierarchy) {
  return "Operation";
}

const statusOptions = ["completed", "error", "running", "pending"] as const;
function getNodeStatus(node: Hierarchy): (typeof statusOptions)[number] {
  return String(
    node?.data?.status ?? "pending",
  ) as (typeof statusOptions)[number];
}

function StatusIcon({ status }: { status: string }) {
  const cls = `hierarchyNodeIcon status-${status}`;
  const title = status ? `Status: ${status}` : "Status";

  return (
    <span className={cls} aria-hidden="false" title={title}>
      {status === "completed" ? (
        <Checkmark styles={iconStyle({ size: "S" })} />
      ) : status === "error" ? (
        <AlertTriangle styles={iconStyle({ size: "S" })} />
      ) : status === "running" ? (
        <Play styles={iconStyle({ size: "S" })} />
      ) : status === "pending" ? (
        <ClockPending styles={iconStyle({ size: "S" })} />
      ) : (
        <Circle styles={iconStyle({ size: "XS" })} />
      )}
    </span>
  );
}

function matches(filter: string | undefined, node: Hierarchy): boolean {
  if (!filter) return true;
  const search = filter.toLowerCase();

  const nodeLabel = getNodeLabel(node);
  const opKind = getOperationKind(node);
  const status = getNodeStatus(node);

  if (nodeLabel.toLowerCase().includes(search)) return true;
  if (opKind.toLowerCase().includes(search)) return true;
  if (status.toLowerCase().includes(search)) return true;

  for (let c of node.children ?? []) {
    if (matches(filter, c)) return true;
  }
  return false;
}

// TODO not use event emitter
const onSelectionChange: ((id: string) => void) | undefined = undefined;

export function HierarchyTree(props: {
  hierarchy?: Hierarchy;
  filter?: string;
}) {
  const { hierarchy, filter } = props;
  const params = useParams();
  const navigate = useNavigate();

  function navigateToNode(id: string) {
    onSelectionChange?.(id);
    const encoded = encodeURIComponent(id);
    const parts = window.location.pathname.split("/").filter(Boolean);
    const base = parts[0] ? `/${parts[0]}` : "";
    // navigate to absolute base route to avoid appending when we're already on a node path
    navigate(`${base}/${encoded}`);
  }

  function renderItem(node: Hierarchy): React.ReactNode {
    const isSelected = node.id === params.nodeId;
    const nodeLabel = getNodeLabel(node);
    const opKind = getOperationKind(node);
    const status = getNodeStatus(node);
    if (!matches(filter, node)) return null;

    return (
      <TreeViewItem key={node.id} textValue={nodeLabel}>
        <TreeViewItemContent>
          <div
            className={`hierarchyNode ${isSelected ? "hierarchyRowSelected" : ""}`}
            onClick={(e) => {
              // ensure clicking the row selects it and reveals attributes
              e.stopPropagation();
              navigateToNode(node.id);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                navigateToNode(node.id);
              }
            }}
          >
            <StatusIcon status={status} />

            <Text UNSAFE_className={"hierarchyNodeName"}>{nodeLabel}</Text>

            <Text UNSAFE_className="hierarchyNodeType">{opKind}</Text>
          </div>
        </TreeViewItemContent>
        {node.children?.map((c) => renderItem(c))}
      </TreeViewItem>
    );
  }

  if (!hierarchy) {
    return <div className="hierarchyNoData">No data</div>;
  }

  const defaultExpandedKeys = new Set<string>([
    hierarchy.id,
    ...(hierarchy.children?.map((c) => c.id) ?? []),
  ]);

  return (
    <div className="hierarchyContainer">
      <TreeView
        aria-label="Hierarchy"
        defaultExpandedKeys={defaultExpandedKeys}
        onAction={(key) => {
          const id = String(key);
          navigateToNode(id);
        }}
      >
        {renderItem(hierarchy)}
      </TreeView>
    </div>
  );
}
