import { createRef, useEffect, useState } from "react";
import type { Hierarchy } from "../data/types.ts";
import { Tree, type RawNodeDatum } from "react-d3-tree";
import { type Labels, LabelsContext } from "../../lib/labels.ts";
import "./Graphic.css";
import { ActionButton, ToastQueue } from "@react-spectrum/s2";
import { exportSvgElementToPng, exportSvgElement } from "./exportGraphic";

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
  useEffect(() => {
    const handleResize = () => {
      if (ref.current) {
        const box = ref.current.getBoundingClientRect();
        if (
          !box.width ||
          !box.height ||
          (box.width === dimensions?.width && box.height === dimensions?.height)
        ) {
          return;
        }
        console.log({ w: box.width, h: box.height });
        setDimensions({ width: box.width, height: box.height });
        // Trigger re-render or update state if needed
      }
    };

    // Initial size set
    handleResize();

    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
    };
  }, [ref]);

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
    <div id="treeWrapper" ref={ref}>
      <div className="graphicControls">
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
