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

export function HierarchyTree(props: {
  hierarchy?: Hierarchy;
  selectedKey?: string | undefined;
  onSelectionChange?: (key?: string) => void;
  filter?: string;
}) {
  const { hierarchy, selectedKey, onSelectionChange, filter } = props;

  function matches(node: Hierarchy, q?: string): boolean {
    if (!q) return true;
    const search = q.toLowerCase();

    const name = String(node.data?.name ?? node.id).toLowerCase();
    const type = String(node.data?.type ?? "").toLowerCase();
    const status = String(node.data?.status ?? "").toLowerCase();

    if (name.includes(search)) return true;
    if (type.includes(search)) return true;
    if (status.includes(search)) return true;

    // include labels in search
    const labels =
      (node.data && (node.data["@effectionx/inspector.labels"] as any)) ?? {};
    for (let k of Object.keys(labels)) {
      const v = String(labels[k] ?? "").toLowerCase();
      if (v.includes(search)) return true;
    }

    for (let c of node.children ?? []) {
      if (matches(c, q)) return true;
    }
    return false;
  }

  function getTypeLabel(node: Hierarchy) {
    // Favor explicit `type` on the node, otherwise infer from labels.
    const explicit = node.data?.type;
    if (explicit) return String(explicit);

    const labels =
      (node.data && (node.data["@effectionx/inspector.labels"] as any)) ?? {};
    if (!labels || typeof labels !== "object") return "";

    if (labels.port || labels.url || labels.method) return "Resource";
    if (labels.args || (Array.isArray(labels) && labels.length > 0))
      return "Task";
    if (labels.name && String(labels.name).includes("/")) return "Service";

    return "";
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

  function renderItem(node: Hierarchy): React.ReactNode {
    if (!matches(node, filter)) return null;

    const isSelected = node.id === selectedKey;
    const typeLabel = getTypeLabel(node);
    const status = String(node.data?.status ?? "").toLowerCase();

    return (
      <TreeViewItem
        key={node.id}
        textValue={String(node.data?.name ?? node.id)}
      >
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

            <Text UNSAFE_className={`hierarchyNodeName`}>
              {String(node.data?.name ?? node.id)}
            </Text>

            <Text UNSAFE_className="hierarchyNodeType">{typeLabel}</Text>
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
