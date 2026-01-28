import React from "react";
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

const labelAttribute = "@effectionx/inspector.labels";

function getNodeLabel(node: Hierarchy) {
  const inspectorLabels = (
    node?.data && labelAttribute in node.data ? node.data[labelAttribute] : {}
  ) as Record<string, unknown>;
  const label = String(inspectorLabels?.name ?? node.id);
  return label === "anonymous" ? `${label} [${node.id}]` : label;
}

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

export function HierarchyTree(props: {
  hierarchy?: Hierarchy;
  selectedKey?: string | undefined;
  onSelectionChange?: (key?: string) => void;
  filter?: string;
}) {
  const { hierarchy, selectedKey, onSelectionChange, filter } = props;

  function renderItem(node: Hierarchy): React.ReactNode {
    const isSelected = node.id === selectedKey;
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
              onSelectionChange?.(node.id);
              window.dispatchEvent(
                new CustomEvent("inspector:reveal-attributes", {
                  detail: node.id,
                }),
              );
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                e.stopPropagation();
                onSelectionChange?.(node.id);
                window.dispatchEvent(
                  new CustomEvent("inspector:reveal-attributes", {
                    detail: node.id,
                  }),
                );
              }
            }}
          >
            <StatusIcon status={status} />

            <Text UNSAFE_className={`hierarchyNodeName`}>{nodeLabel}</Text>

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
          onSelectionChange?.(id);
          window.dispatchEvent(
            new CustomEvent("inspector:reveal-attributes", { detail: id }),
          );
        }}
      >
        {renderItem(hierarchy)}
      </TreeView>
    </div>
  );
}
