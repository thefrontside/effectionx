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

  function scheduleRender() {
    console.log("Scheduling render for Graphic component", hierarchy);
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
    console.log({
      svgRect,
      rootRect,
      wrapperRect,
    });
    const box = {
      width: wrapperRect.width,
      // height is tootal
      height: rootRect.height - svgRect.top,
    };

    // console.log("Container box for Graphic render:", box);
    if (!box.width || !box.height) {
      console.warn("Graphic render skipped due to zero width or height:", box);
      return;
    }

    try {
      // there is padding in the tab-panel so if we set it too large, it shifts outside
      // and triggers a resize loop. We can leave a small gap to avoid this.
      renderChart(svg, box, hierarchy);
    } catch (err) {
      console.error("renderChart error (Graphic):", err);
    }
  }

  // listen to sl-resize events bubbled from <sl-resize-observer>
  this.addEventListener("sl-resize", (event) => {
    console.log("Resize event:", event);
    this.refresh();
  });

  for await ({ hierarchy } of this) {
    yield (
      <div
        // Prevent Crank from re-rendering the SVG subtree so D3 can manage DOM updates
        copy={true}
        id="graphic-wrapper"
      >
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

  // Compute the extent of the tree. Note that x and y are swapped here
  // because in the tree layout, x is the breadth, but when displayed, the
  // tree extends right rather than down.
  let x0 = Number.POSITIVE_INFINITY;
  let x1 = -x0;
  root.each((d) => {
    if (typeof d.x === "number") {
      if (d.x > x1) x1 = d.x;
      if (d.x < x0) x0 = d.x;
    }
  });

  // Compute the adjusted height of the tree.
  const height = x1 - x0 + dx * 2;

  const svg = d3.select(ref);

  // Ensure groups exist for stable selection (links / nodes)
  if (svg.select("g[data-links]").empty()) {
    svg.append("g").attr("data-links", "");
  }
  if (svg.select("g[data-nodes]").empty()) {
    svg.append("g").attr("data-nodes", "");
  }

  svg
    .attr("width", container.width)
    // Use the panel's available height if possible so the SVG fills the tab
    // panel; keep the viewBox at the chart's computed height so the content
    // scales to fit the panel by default.
    .attr("height", container.height)
    .attr("viewBox", [-dy / 3, x0 - dx, container.width, height])
    // Align the SVG content to the top-left so the graph is visible without
    // being vertically centered and pushed out of view by aspect-ratio
    // letterboxing.
    .attr("preserveAspectRatio", "xMinYMin meet");

  svg
    .select("g[data-links]")
    .attr("fill", "none")
    .attr("stroke", "#555")
    .attr("stroke-opacity", 0.4)
    .attr("stroke-width", 1.5)
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
      return `M${s.y},${s.x}C${(s.y + t.y) / 2},${s.x} ${(s.y + t.y) / 2},${t.x} ${t.y},${t.x}`;
    });

  const node = svg
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
    .attr("transform", (d) => `translate(${d.y},${d.x})`);

  node
    .selectAll("circle")
    .data((d) => [d])
    .join(
      (enter) => enter.append("circle"),
      (update) => update,
      (exit) =>
        exit
          .remove()
          .attr("fill", "red")
          .transition()
          .duration(500)
          .attr("r", 0),
    )
    .attr("r", 0)
    .transition()
    .duration(500)
    .ease(d3.easeLinear)
    .attr("fill", (d: any) => (d.children ? "#555" : "#999"))
    .attr("r", Math.max(2.5, Math.min(8, dx * 0.5)));

  node
    .selectAll("text")
    .data((d) => [d])
    .join(
      (enter) => enter.append("text"),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("opacity", 0)
    .transition()
    .duration(500)
    .ease(d3.easeLinear)
    .attr("dy", "0.31em")
    .attr("x", (d: any) => (d.children ? -6 : 6))
    .attr("text-anchor", (d: any) => (d.children ? "end" : "start"))
    .text((d: any) => textValue(d))
    .style("font-size", `${Math.max(10, Math.min(dx * 0.6, 25))}px`)
    .attr("opacity", 1)
    .attr("fill", themeBasedFill("white", "black"))
    .attr("paint-order", "fill");
}
