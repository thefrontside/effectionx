import * as d3 from "d3";
import type { Context } from "@b9g/crank";
import type { Hierarchy } from "../data/types.ts";

// using an async function generator so we can call `scheduleRender` after yielding
// the SVG element to ensure it's in the DOM and has dimensions before
// we attempt to render the chart. Other methods lead to infinite render loops.
export async function* Graphic(
  this: Context,
  { hierarchy, selection }: { hierarchy: Hierarchy; selection: Hierarchy },
) {
  let svgEl: SVGSVGElement | null = null;
  // orientation state (vertical by default as requested)
  let orientation: "vertical" | "horizontal" = "vertical";
  // track the currently selected id so scheduleRender can pass it into renderChart
  let currentSelectionId: string | undefined = selection?.id;

  function resetZoom() {
    if (!svgEl) return;
    const svg = d3.select(svgEl);
    const zoomNode = svg.node();
    if (zoomNode && zoomNode.__zoomBehavior) {
      svg
        .transition()
        .duration(350)
        .call(zoomNode.__zoomBehavior.transform, d3.zoomIdentity);
    }
  }

  function scheduleRender() {
    if (!hierarchy) return;
    const svg = svgEl;
    if (!svg) return;
    const root = svg.closest && (svg.closest("html") as Element | null);
    if (!root) return;
    const graphicWrapper =
      svg.closest && (svg.closest("#graphic-wrapper") as Element | null);
    if (!graphicWrapper) return;

    const svgRect = svg.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    const wrapperRect = graphicWrapper.getBoundingClientRect();

    const box = {
      width: wrapperRect.width,
      // height is total available from svg top to window bottom
      height: Math.max(0, rootRect.height - svgRect.top),
    };

    // ensure the latest selection id is passed to the chart renderer
    currentSelectionId = selection?.id;

    // console.log("Container box for Graphic render:", box);
    if (!box.width || !box.height) {
      // console.warn("Graphic render skipped due to zero width or height:", box);
      return;
    }

    try {
      // there is padding in the tab-panel so if we set it too large, it shifts outside
      // and triggers a resize loop. We can leave a small gap to avoid this.
      renderChart(svg, box, hierarchy, orientation, currentSelectionId);
    } catch (err) {
      console.error("renderChart error (Graphic):", err);
    }
  }

  // listen to sl-resize events bubbled from <sl-resize-observer>
  this.addEventListener("sl-resize", () => {
    this.refresh();
  });

  for await ({ hierarchy, selection } of this) {
    // keep a live copy of the selected id (loop-scoped selection gets updated)
    currentSelectionId = selection?.id;

    yield (
      <div id="graphic-wrapper">
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginBottom: "6px",
            padding: "20px",
          }}
        >
          <sl-button
            size="small"
            aria-pressed={orientation === "vertical"}
            variant={orientation === "vertical" ? "primary" : "default"}
            onClick={() => {
              if (orientation !== "vertical") {
                orientation = "vertical";
                resetZoom();
                this.refresh();
              }
              scheduleRender();
            }}
          >
            Vertical
          </sl-button>
          <sl-button
            size="small"
            aria-pressed={orientation === "horizontal"}
            variant={orientation === "horizontal" ? "primary" : "default"}
            onClick={() => {
              if (orientation !== "horizontal") {
                orientation = "horizontal";
                resetZoom();
                this.refresh();
              }
              scheduleRender();
            }}
          >
            Horizontal
          </sl-button>
        </div>

        <div copy={true}>
          <sl-resize-observer>
            <svg
              id="details-graph-svg"
              role="img"
              aria-labelledby="details-graph-svg-title"
              ref={(el: SVGSVGElement | null) => {
                svgEl = el;
              }}
            >
              <title id="details-graph-svg-title">Process graph</title>
              <g data-links />
              <g data-nodes />
            </svg>
          </sl-resize-observer>
        </div>
      </div>
    );
    // schedule a render after yielding the SVG element to ensure it's in the DOM and has dimensions
    scheduleRender();
  }
}

function textValue(node: d3.HierarchyNode<Hierarchy>) {
  const labelName = (node.data.data["@effection/attributes"] as any)?.name;
  return `${node.data.id} [${labelName}]`;
}

function themeBasedFill(dark: string, light: string) {
  // Prefer explicit app theme class, then fall back to system preference
  if (typeof window === "undefined") return light;
  if (document.documentElement.classList.contains("sl-theme-dark")) return dark;
  if (
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  )
    return dark;
  return light;
}

export function renderChart(
  ref: SVGSVGElement,
  container: { width: number; height: number },
  data: Hierarchy,
  orientation: "vertical" | "horizontal" = "vertical",
  selectedId?: string,
) {
  const root = d3.hierarchy(data);
  // Scale the vertical spacing based on the panel height so the tree fills
  // the available vertical space rather than always using a tiny fixed value.
  const descendantCount = root.descendants().length;
  const dx = Math.max(20, (container.height || 0) / (descendantCount + 1));
  const dy = container.width / (root.height + 1);

  // Create a tree layout with computed spacing.
  const tree = d3.tree().nodeSize([dx, dy]);

  // Sort the tree and apply the layout.
  root.sort((a, b) => d3.ascending(a.data.id, b.data.id));
  tree(root as unknown as d3.HierarchyNode<unknown>);

  // Compute the extent of the tree (extent is along the "x" value used by the layout)
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = -x0;
  root.each((d) => {
    if (typeof d.x === "number") {
      if (d.x > x1) x1 = d.x;
      if (d.x < x0) x0 = d.x;
    }
  });

  // Compute the adjusted span along the x axis used by the layout.
  const spanX = x1 - x0 + dx * 2;

  const svg = d3.select(ref);

  // Ensure a viewport group exists: we apply zoom/pan transforms to this group.
  if (svg.select("g[data-viewport]").empty()) {
    svg.append("g").attr("data-viewport", "");
  }
  const viewport = svg.select("g[data-viewport]");

  // Ensure groups exist within the viewport for stable selection (links / nodes)
  if (viewport.select("g[data-links]").empty()) {
    viewport.append("g").attr("data-links", "");
  }
  if (viewport.select("g[data-nodes]").empty()) {
    viewport.append("g").attr("data-nodes", "");
  }

  // Preserve any user-applied transform (zoom/pan) across re-renders.
  const currentTransform = viewport.attr("transform");

  // Compute viewBox depending on orientation. For vertical we place the x span
  // horizontally (viewBox x origin = x0 - dx) and let the vertical dimension be the
  // container height. For horizontal we place the x span vertically as before.
  if (orientation === "vertical") {
    svg
      .attr("width", container.width)
      .attr("height", container.height)
      .attr("viewBox", [x0 - dx, -dy / 3, spanX, container.height])
      .attr("preserveAspectRatio", "xMinYMin meet");
  } else {
    // horizontal (existing behavior)
    svg
      .attr("width", container.width)
      .attr("height", container.height)
      .attr("viewBox", [-dy / 3, x0 - dx, container.width, spanX])
      .attr("preserveAspectRatio", "xMinYMin meet");
  }

  // Install zoom behavior once.
  const nodeZoom = svg.node();
  if (nodeZoom && !("__zoomInitialized" in nodeZoom)) {
    const zoomBehavior = d3
      .zoom()
      .scaleExtent([0.2, 6])
      .on("zoom", (event) => {
        viewport.attr("transform", event.transform);
      });

    // Apply the zoom behavior to the svg. Casts added for TS safety.
    svg.call(
      zoomBehavior as unknown as d3.ZoomBehavior<SVGSVGElement, unknown>,
    );

    // dblclick to reset zoom
    svg.on("dblclick.zoom", () => {
      svg
        .transition()
        .duration(350)
        .call((sel) =>
          sel.call(zoomBehavior.transform as any, d3.zoomIdentity),
        );
    });

    // @ts-expect-error Mark the node as having the zoom behavior initialized
    // so we don't re-apply it on every render.
    nodeZoom.__zoomInitialized = true;
    // store the behavior so callers can reset programmatically
    // @ts-expect-error
    nodeZoom.__zoomBehavior = zoomBehavior;
  }

  // Restore preserved transform (if any)
  if (currentTransform) {
    viewport.attr("transform", currentTransform);
  }

  const linksGroup = viewport
    .select("g[data-links]")
    .attr("fill", "none")
    .attr("stroke", "#555")
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 1.5);

  linksGroup
    .selectAll("path")
    .data(root.links())
    .join(
      (enter) => enter.append("path"),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("d", (link) => {
      const s = link.source;
      const t = link.target;
      if (
        typeof s.y !== "number" ||
        typeof s.x !== "number" ||
        typeof t.y !== "number" ||
        typeof t.x !== "number"
      ) {
        return "";
      }
      if (orientation === "vertical") {
        // for vertical layout: coordinates are (x,y) -> translate(x,y)
        return `M${s.x},${s.y}C${s.x},${(s.y + t.y) / 2} ${t.x},${(s.y + t.y) / 2} ${t.x},${t.y}`;
      }
      // horizontal layout: existing behavior (translate(y,x))
      return `M${s.y},${s.x}C${(s.y + t.y) / 2},${s.x} ${(s.y + t.y) / 2},${t.x} ${t.y},${t.x}`;
    });

  const node = viewport
    .select("g[data-nodes]")
    .selectAll("g")
    .data(root.descendants())
    .join(
      (enter) => enter.append("g"),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("id", (d) => `g-${d.data.id}`)
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", 3)
    .attr("transform", (d) => {
      if (orientation === "vertical") return `translate(${d.x},${d.y})`;
      return `translate(${d.y},${d.x})`;
    })
    .style("cursor", "pointer")
    .on("click", function (event: any, d: any) {
      event.stopPropagation();
      const id = d && d.data && d.data.id;
      if (id) {
        (ref as Element).dispatchEvent(
          new CustomEvent("sl-selection-change", {
            detail: { selection: [{ dataset: { id } }] },
            bubbles: true,
            composed: true,
          }),
        );
      }
    })
    .attr("data-selected", (d) => (selectedId === d.data.id ? "true" : null));

  node
    .selectAll("circle")
    .data((d) => [d])
    .join(
      (enter) => enter.append("circle").attr("r", 0),
      (update) => update,
      (exit) => exit.remove().attr("fill", "red"),
    )
    .attr("fill", (d: any) =>
      selectedId === d.data.id ? "#ff9800" : d.children ? "#555" : "#999",
    )
    .transition()
    .duration(500)
    .ease(d3.easeLinear)
    .attr("stroke", (d: any) => (selectedId === d.data.id ? "#000" : "none"))
    .attr("stroke-width", (d: any) => (selectedId === d.data.id ? 1.5 : 0))
    .attr("r", Math.max(2.5, Math.min(8, dx * 0.5)));

  node
    .selectAll("text")
    .data((d) => [d])
    .join(
      (enter) => enter.append("text").attr("opacity", 0),
      (update) => update,
      (exit) => exit.remove().attr("opacity", 0),
    )

    .transition()
    .duration(500)
    .ease(d3.easeLinear)
    .attr("dy", "0.31em")
    .attr("x", (d: any) => {
      if (orientation === "vertical") return 8;
      return d.children ? -8 : 8;
    })
    .attr("text-anchor", (d: any) => {
      if (orientation === "vertical") return "start";
      return d.children ? "end" : "start";
    })
    .text((d: any) => textValue(d))
    .style("font-size", `${Math.max(5, Math.min(dx * 0.6, 10))}px`)
    .attr("opacity", 1)
    .attr("fill", themeBasedFill("white", "black"))
    .attr("paint-order", "fill");
}
