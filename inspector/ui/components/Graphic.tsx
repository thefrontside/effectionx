import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { useSelector } from "starfx/react";
import {
  nodeAtTick,
  type EffectionStateNode,
} from "../store/selector/data-tree";
import type { AppState } from "../store/schema";

export function Graphic() {
  const ref = useRef<SVGSVGElement>(null);
  const data = useSelector((s: AppState) => nodeAtTick(s, 0));

  useEffect(() => {
    chart(ref.current, data);
  }, [data]);

  return (
    <svg ref={ref}>
      <title>Tasks graph</title>
      <g className="nodes" />
      <g className="links" />
    </svg>
  );
}

function chart(ref: SVGSVGElement | null, data: EffectionStateNode[]) {
  if (!ref) return;
  const box = ref.getBoundingClientRect();
  const width = box.width;

  const base = d3
    .stratify<EffectionStateNode>()
    .id((d) => d.id)
    .parentId((d) => d.parentId)(data);
  // Compute the tree height; this approach will allow the height of the
  // SVG to scale according to the breadth (width) of the tree layout.
  const root = d3.hierarchy(base);
  const dx = 10;
  const dy = width / (root.height + 1);

  // Create a tree layout.
  const tree = d3.tree().nodeSize([dx, dy]);

  // Sort the tree and apply the layout.
  root.sort((a, b) => d3.ascending(a.data.name, b.data.name));
  tree(root);

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

  svg
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-dy / 3, x0 - dx, width, height])
    .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

  const link = svg
    .select("g.links")
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
    .attr(
      "d",
      d3
        .linkHorizontal()
        .x((d) => d.y)
        .y((d) => d.x),
    );

  const node = svg
    .select("g.nodes")
    .selectAll("g")
    .data(root.descendants())
    .join(
      (enter) => enter.append("g"),
      (update) => update,
      (exit) => exit.remove(),
    )
    .attr("stroke-linejoin", "round")
    .attr("stroke-width", 3)
    .attr("transform", (d) => `translate(${d.y},${d.x})`);

  node
    .append("circle")
    .attr("fill", (d) => (d.children ? "#555" : "#999"))
    .attr("r", (d) => (d.data.data.current === "finalized" ? 2.5 : 4.5));

  node
    .append("text")
    .attr("dy", "0.31em")
    .attr("x", (d) => (d.children ? -6 : 6))
    .attr("text-anchor", (d) => (d.children ? "end" : "start"))
    .text((d) => {
      return `${d.data.data.id} [${d.data.data.current}]`;
    })
    .attr("stroke", "white")
    .attr("paint-order", "stroke");
}
