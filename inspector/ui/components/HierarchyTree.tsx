import { useState, useEffect } from "react";

import {
  TreeView,
  TreeViewItem,
  TreeViewItemContent,
} from "@react-spectrum/s2";
import type { Hierarchy } from "../data/types";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
// import { } from '@react-spectrum/s2/utils'

const _treeStyleObj = {
  paddingY: "8",
  paddingX: "12",
  height: "100%",
  overflow: "auto",
  boxSizing: "border-box",
  selectors: {
    '& [role="gridcell"] > div': {
      display: "flex",
      alignItems: "center",
      gap: "8",
      width: "100%",
      justifyContent: "flex-start",
      gridColumn: "2 / -1",
    },
    '& [role="row"]': { alignItems: "center", minHeight: "[40px]" },
    /* Make the expand/collapse button easier to hit and align the svg */
    '& [role="gridcell"] button': {
      width: "[36px]",
      height: "[36px]",
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      marginInlineEnd: "8",
      padding: "0",
      background: "transparent",
      border: "none",
    },
    '& [role="gridcell"] button svg': {
      width: "[18px]",
      height: "[18px]",
    },
    /* visually de-emphasize the native expand/collapse button; keep it in the DOM for keyboard users */
    '& [role="gridcell"] > div > button[aria-label^="Expand"], & [role="gridcell"] > div > button[aria-label^="Collapse"]':
      {
        opacity: "0",
        pointerEvents: "none",
      },
  },
} as const;
const treeStyles = style({ ..._treeStyleObj } as const);

// Individual scoped styles replacing legacy classnames
const nodeBaseStyle = style({
  display: "flex",
  alignItems: "center",
  gap: "12",
  paddingY: "8",
  paddingStart: "8",
  paddingEnd: "12",
  minHeight: "[44px]",
  borderBottomWidth: "1",
  borderStyle: "solid",
  borderColor: "var(--spectrum-global-color-gray-100)",
  selectors: {
    "&:hover": { background: "var(--spectrum-global-color-gray-50)" },
    "& svg": { display: "inline-block", verticalAlign: "middle" },
  },
} as const);

const nodeSelectedStyle = style({
  background:
    "var(--spectrum-alias-background-selected, rgba(0, 120, 212, 0.04))",
  borderStartWidth: "2",
  borderStyle: "solid",
  borderColor: "var(--spectrum-global-color-blue-600)",
  paddingStart: "12",
  selectors: {
    "& span": { color: "var(--spectrum-global-color-gray-950)" },
  },
} as const);

const hierarchyNodeNameStyle = style({
  cursor: "pointer",
  font: "body",
  fontWeight: "bold",
  whiteSpace: "nowrap",
  overflow: "hidden",
  textOverflow: "ellipsis",
});
const hierarchyNodeTypeStyle = style({
  marginStart: "auto",
  color: "var(--spectrum-global-color-gray-600)",
  font: "body-sm",
  whiteSpace: "nowrap",
  alignSelf: "center",
  fontWeight: "bold",
  selectors: {
    "&:before": { content: "''", display: "inline-block", width: "[8px]" },
  },
} as const);
const hierarchyNoDataStyle = style({
  color: "var(--spectrum-global-color-gray-600)",
} as const);
const statusColorBase = {
  // width: "[20px]",
  // height: "[20px]",
  // flex: "0 0 20px",
  // display: "inline-flex",
  // alignItems: "center",
  // justifyContent: "center",
  // backgroundColor: "var(--spectrum-global-color-gray-50)",
  // borderRadius: "9999px",
  // padding: "2",
  // marginEnd: "8",
  color: "white",
} as const;

const statusColor = {
  color: {
    status: {
      default: "var(--spectrum-global-color-gray-600)",
      running: "var(--spectrum-global-color-green-600)",
      completed: "var(--spectrum-global-color-gray-400)",
      error: "var(--spectrum-global-color-red-600)",
      pending: "var(--spectrum-global-color-yellow-600)",
    },
  },
} as const;

const typeBadgeStyle = style({
  default: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: "[20px]",
    height: "[20px]",
    marginStart: "8",
    marginEnd: "8",
    background: "transparent",
    borderRadius: "[4px]",
    color: "var(--spectrum-global-color-gray-700)",
    fontSize: "[12px]",
    fontWeight: "bold",
  },
} as const);

// Left-side toggle button to visually place expand affordance on the left while delegating intent
const leftExpandStyle = style({
  width: "[36px]",
  height: "[36px]",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginEnd: "8",
  padding: "0",
  background: "transparent",
  border: "none",
  cursor: "pointer",
  color: "var(--spectrum-global-color-gray-600)",
  selectors: {
    "&:hover": { color: "var(--spectrum-global-color-gray-800)" },
    "& svg": { width: "[12px]", height: "[12px]" },
  },
} as const);

// Placeholder for leaf nodes so text aligns with toggles
const leftExpandPlaceholder = style({
  width: "[36px]",
  height: "[36px]",
  display: "inline-flex",
  alignItems: "center",
  justifyContent: "center",
  marginEnd: "8",
  padding: "0",
  background: "transparent",
  border: "none",
  visibility: "hidden",
} as const);

import Checkmark from "@react-spectrum/s2/icons/Checkmark";
import AlertTriangle from "@react-spectrum/s2/icons/AlertTriangle";
import Play from "@react-spectrum/s2/icons/Play";
import ClockPending from "@react-spectrum/s2/icons/ClockPending";
import Circle from "@react-spectrum/s2/icons/Circle";

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

const statusIconStyle = style({
  ...statusColorBase,
  ...statusColor,
} as const);

function resolveClass(
  c: string | ((props?: Record<string, any>) => string) | undefined,
  props?: Record<string, any>,
) {
  if (!c) return undefined;
  return typeof c === "function" ? c(props) : c;
}

function StatusIcon({ status }: { status: string }) {
  const title = status ? `Status: ${status}` : "Status";
  const className = resolveClass(statusIconStyle, { status });

  return (
    <span className={className} aria-hidden="false" title={title}>
      {status === "completed" ? (
        <Checkmark />
      ) : status === "error" ? (
        <AlertTriangle />
      ) : status === "running" ? (
        <Play />
      ) : status === "pending" ? (
        <ClockPending />
      ) : (
        <Circle />
      )}
    </span>
  );
}
function ChevronIcon({ direction }: { direction: "down" | "right" }) {
  // simple inline chevron icon (keeps dependency surface small)
  const transform = direction === "down" ? "rotate(90 12 12)" : undefined;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
      <g transform={transform}>
        <path
          fill="currentColor"
          d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"
        />
      </g>
    </svg>
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

  const [expandedKeys, setExpandedKeys] = useState<Set<string>>(() => {
    if (!hierarchy) return new Set<string>();
    return new Set<string>([
      hierarchy.id,
      ...(hierarchy.children?.map((c) => c.id) ?? []),
    ]);
  });

  useEffect(() => {
    if (!hierarchy) return;
    setExpandedKeys(
      new Set<string>([
        hierarchy.id,
        ...(hierarchy.children?.map((c) => c.id) ?? []),
      ]),
    );
  }, [hierarchy]);

  if (!hierarchy) {
    return (
      <div
        className={`${resolveClass(hierarchyNoDataStyle) ?? ""} hierarchyNoData`}
      >
        No data
      </div>
    );
  }

  function toggleExpanded(id: string) {
    setExpandedKeys((prev) => {
      const next = new Set(Array.from(prev));
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function renderItem(node: Hierarchy, depth = 1): React.ReactNode {
    const isSelected = node.id === params.nodeId;
    const nodeLabel = getNodeLabel(node);
    const opKind = getOperationKind(node);
    const status = getNodeStatus(node);
    if (!matches(filter, node)) return null;

    // Predefined indent classes (style macro must be evaluated statically). Support depths 0..6.
    const indentClasses = [
      style({ paddingStart: "[0px]" }),
      style({ paddingStart: "[12px]" }),
      style({ paddingStart: "[24px]" }),
      style({ paddingStart: "[36px]" }),
      style({ paddingStart: "[48px]" }),
      style({ paddingStart: "[60px]" }),
      style({ paddingStart: "[72px]" }),
    ];
    const indentClass =
      indentClasses[Math.min(depth, indentClasses.length - 1)];

    // derive a simple type from node name / data to choose a compact icon
    const nodeNameLower = nodeLabel.toLowerCase();
    function getNodeType(): "server" | "database" | "task" | "operation" {
      if (
        nodeNameLower.includes("server") ||
        nodeNameLower.includes("httpserver")
      )
        return "server";
      if (nodeNameLower.includes("database") || nodeNameLower.includes("db"))
        return "database";
      if (nodeNameLower.includes("task") || nodeNameLower.includes("scheduled"))
        return "task";
      return "operation";
    }
    const nodeType = getNodeType();

    const typeClass = resolveClass(typeBadgeStyle, { variant: nodeType });
    return (
      <TreeViewItem id={node.id} key={node.id} textValue={nodeLabel}>
        <TreeViewItemContent>
          <div
            className={`${resolveClass(nodeBaseStyle) ?? ""} ${resolveClass(indentClass) ?? ""} ${isSelected ? (resolveClass(nodeSelectedStyle) ?? "") : ""}`}
            onClick={(e) => {
              // if the user clicked an interactive control inside the row (expand button),
              // do not treat it as a selection click — keep expand/selection targets separate.
              const target = e.target as HTMLElement;
              if (target && target.closest && target.closest("button")) return;
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
            {/* Left toggle / placeholder: visual affordance that toggles the controlled expanded state. For leaves we render a placeholder to keep spacing consistent */}
            {node.children && node.children.length > 0 ? (
              <button
                className={resolveClass(leftExpandStyle)}
                aria-label={`Toggle ${nodeLabel}`}
                onClick={(e) => {
                  e.stopPropagation();
                  e.preventDefault();
                  toggleExpanded(node.id);
                }}
              >
                {/* inline chevron svg — matches Spectrum chevron sizing */}
                <ChevronIcon
                  direction={expandedKeys.has(node.id) ? "down" : "right"}
                />
              </button>
            ) : (
              <span
                className={resolveClass(leftExpandPlaceholder)}
                aria-hidden="true"
              />
            )}

            <StatusIcon status={status} />

            {/* compact type badge next to the status */}
            <span className={typeClass} aria-hidden="true">
              {nodeType === "task" ? <ClockPending /> : <Circle />}
            </span>

            <span className={resolveClass(hierarchyNodeNameStyle)}>
              {nodeLabel}
            </span>

            <span className={resolveClass(hierarchyNodeTypeStyle)}>
              {opKind}
            </span>
          </div>
        </TreeViewItemContent>
        {node.children?.map((c) => renderItem(c, depth + 1))}
      </TreeViewItem>
    );
  }

  return (
    <div className={resolveClass(treeStyles)}>
      <TreeView
        aria-label="Hierarchy"
        expandedKeys={expandedKeys}
        onExpandedChange={(keys) => {
          setExpandedKeys(new Set(Array.from(keys).map(String)));
        }}
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
