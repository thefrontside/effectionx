import * as d3 from "d3";
import type { Context } from "@b9g/crank";
import type { Hierarchy } from "../data/types.ts";

export function* Graphic(
  this: Context,
  { hierarchy }: { hierarchy?: Hierarchy },
) {
  let svgEl: SVGSVGElement | null = null;

  function scheduleRender() {
    if (!hierarchy) return;
    const svg = svgEl;
    if (!svg) return;
    // const rect = svg.getBoundingClientRect();
    // Avoid rendering while panel is hidden / zero-sized
    // TODO the rect sizing doesn't come
    // if (rect.width === 0 || rect.height === 0) return;

    try {
      renderChart(svg, hierarchy);
    } catch (err) {
      console.error("renderChart error (Graphic):", err);
    }
  }

  // listen to sl-resize events bubbled from <sl-resize-observer>
  this.addEventListener("sl-resize", () => this.refresh());

  this.after(() => scheduleRender());

  for ({} of this) {
    yield (
      <sl-resize-observer>
        <svg
          // Prevent Crank from re-rendering the SVG subtree so D3 can manage DOM updates
          copy={true}
          id="details-graph-svg"
          width="100%"
          height="100%"
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
    );
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

export function renderChart(ref: SVGSVGElement | null, data: Hierarchy) {
  if (!ref) return;
  const box = ref.getBoundingClientRect();
  const width = box.width;

  const root = d3.hierarchy(data);
  // Compute the tree height; this approach will allow the height of the
  // SVG to scale according to the breadth (width) of the tree layout.
  const dx = 20;
  const dy = width / (root.height + 1);

  // Create a tree layout.
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
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-dy / 3, x0 - dx, width, height])
    .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

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
    .data((d: any) => d as any)
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
    .attr("r", 2.5);

  node
    .selectAll("text")
    .data((d: any) => d as any)
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
    .attr("opacity", 1)
    .attr("fill", themeBasedFill("white", "black"))
    .attr("paint-order", "fill");
}
