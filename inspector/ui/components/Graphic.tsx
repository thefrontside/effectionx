import { createRef, useLayoutEffect, useState } from "react";
import type { Hierarchy } from "../data/types.ts";
import { Tree, type RawNodeDatum } from "react-d3-tree";
import { type Labels, LabelsContext } from "../../lib/labels.ts";
import { ActionButton, ToastQueue } from "@react-spectrum/s2";
import { exportSvgElementToPng, exportSvgElement } from "./exportGraphic";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };

const _graphicStyleObj = {
  selectors: {
    "@media (prefers-color-scheme: dark)": {
      "& .node__root > circle": { fill: "steelblue", stroke: "lightblue" },
      "& .node__branch > circle": { fill: "slategray", stroke: "grey" },
      "& .node__leaf > circle": {
        fill: "green",
        stroke: "darkgreen",
        opacity: 0.8,
      },
      "& path.rd3t-link": { strokeWidth: 2, stroke: "white" },
      "& text.rd3t-label__title": { fill: "ivory" },
      "& text.rd3t-label__attributes": { fill: "lightblue" },
    },
  },
} as const;

const graphicStyles = style({
  default: _graphicStyleObj,
} as const);

function resolveClass(
  c: string | ((props?: Record<string, any>) => string) | undefined,
  props?: Record<string, any>,
) {
  if (!c) return undefined;
  return typeof c === "function" ? c(props) : c;
}

// Container style to ensure the graphic fills the available space in the pane
const graphicContainer = style({
  display: "flex",
  flex: "1 1 0%",
  minHeight: 0,
  minWidth: 0,
  width: "100%",
  height: "100%",
  position: "relative",
} as const);

const controlsStyle = style({
  position: "absolute",
  top: 8,
  right: 8,
  zIndex: 10,
  selectors: {
    "& .spectrum-ActionButton": { paddingBlock: 6, paddingInline: 10 },
    "& .spectrum-ActionButton + .spectrum-ActionButton": { marginLeft: 8 },
  },
});

// const themeBasedFill = (dark: string, light: string) =>
//   window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
//     ? dark
//     : light;

export function Graphic({ hierarchy }: { hierarchy?: Hierarchy }) {
  const ref = createRef<HTMLDivElement>();
  const [dimensions, setDimensions] = useState<
    | {
        width: number;
        height: number;
      }
    | undefined
  >();

  // biome-ignore lint/correctness/useExhaustiveDependencies: dimensions handled if not defined as a comparator
  useLayoutEffect(() => {
    const handleResize = () => {
      if (ref.current) {
        let box = ref.current.getBoundingClientRect();
        // If the wrapper reports a very small width (due to internal layout
        // constraints), walk ancestors to find a more representative size
        // (e.g., the tab panel inner area) so the tree can render large.
        if (box.width < 400) {
          let el: HTMLElement | null = ref.current;
          while (el && el.parentElement) {
            const pRect = el.parentElement.getBoundingClientRect();
            if (pRect.width > box.width) {
              box = pRect;
            }
            el = el.parentElement;
          }
        }
        setDimensions({
          width: Math.max(0, box.width),
          height: Math.max(0, box.height),
        });
      }
    };

    // Initial size set
    handleResize();

    // Prefer ResizeObserver for element-level resize detection so the tree
    // can react to flexbox layout changes (not just window resizes).
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        handleResize();
      });
      if (ref.current) ro.observe(ref.current);
    } else {
      window.addEventListener("resize", handleResize);
    }

    // Also re-measure on next paint to catch any race where layout finishes
    // after initial mount.
    const raf = requestAnimationFrame(() => handleResize());

    return () => {
      if (ro && ref.current) ro.unobserve(ref.current);
      if (!ro) window.removeEventListener("resize", handleResize);
      cancelAnimationFrame(raf);
    };
  }, []);

  async function exportToPng() {
    if (!ref.current) return;
    const svg = ref.current.querySelector("svg");
    if (!svg) return;

    try {
      const res = await exportSvgElementToPng(
        svg as SVGElement,
        "effectionx-graph",
      );
      ToastQueue.positive(`Saved ${res.fileName}`, { timeout: 5000 });
    } catch (err: unknown) {
      console.error("export failed", err);
      const debug =
        typeof err === "object" && err !== null && "debugSvg" in err
          ? (err as { debugSvg?: string }).debugSvg
          : undefined;
      ToastQueue.negative("Export failed", {
        actionLabel: "Show details",
        onAction: () => {
          if (debug) {
            const b = new Blob([debug], {
              type: "image/svg+xml;charset=utf-8",
            });
            const url = URL.createObjectURL(b);
            const a = document.createElement("a");
            a.href = url;
            a.download = `effectionx-graph-debug-${Date.now()}.svg`;
            document.body.appendChild(a);
            a.click();
            a.remove();
            setTimeout(() => URL.revokeObjectURL(url), 10000);
          } else {
            // no debug available — do nothing (toast will close)
          }
        },
        shouldCloseOnAction: true,
      });
    }
  }

  function exportToSvg() {
    if (!ref.current) return;
    const svg = ref.current.querySelector("svg");
    if (!svg) return;

    try {
      const res = exportSvgElement(svg as SVGElement, "effectionx-graph");
      ToastQueue.positive(`Saved ${res.fileName}`, { timeout: 5000 });
    } catch (err) {
      console.error("SVG export failed", err);
      ToastQueue.negative("Export SVG failed", { timeout: 5000 });
    }
  }

  return hierarchy ? (
    <div
      id="treeWrapper"
      ref={ref}
      className={`${resolveClass(graphicContainer) ?? ""} ${resolveClass(graphicStyles) ?? ""}`}
    >
      <div className={resolveClass(controlsStyle)}>
        <ActionButton aria-label="Export PNG" onPress={exportToPng}>
          Export PNG
        </ActionButton>
        <ActionButton aria-label="Export SVG" onPress={exportToSvg}>
          Export SVG
        </ActionButton>
      </div>
      <Tree
        data={transform2D3(hierarchy)}
        orientation="vertical"
        translate={
          dimensions?.width
            ? { x: dimensions.width / 2, y: dimensions.height * 0.1 }
            : undefined
        }
        dimensions={dimensions?.width ? dimensions : undefined}
        pathFunc={"step"}
        rootNodeClassName="node__root"
        branchNodeClassName="node__branch"
        leafNodeClassName="node__leaf"
      />
    </div>
  ) : (
    <div />
  );
}

function transform2D3(hierarchy: Hierarchy): RawNodeDatum {
  let { data } = hierarchy;
  let { name, ...attributes } = (data[LabelsContext.name] ??
    LabelsContext.defaultValue) as Labels;
  return {
    name: name as string,
    attributes,
    // to set as proper leaf nodes when no children
    ...(hierarchy.children.length === 0
      ? {}
      : { children: hierarchy.children.map(transform2D3) }),
  };
}
