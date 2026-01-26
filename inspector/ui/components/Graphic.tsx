import * as d3 from "d3";
import { useEffect, useRef } from "react";
import { useSelector } from "starfx/react";
import { treeAtTick } from "../store/selector/data-tree";
import { schema, type AppState } from "../store/schema";
import { Hierarchy } from "../data/types";
import { Tree } from "react-d3-tree";

const themeBasedFill = (dark: string, light: string) =>
  window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
    ? dark
    : light;

export function Graphic({ hierarchy }: { hierarchy?: Hierarchy }) {
  return (
    <div id="treeWrapper" style={{ width: "100vh", height: "100%" }}>
      <Tree data={d3.hierarchy(hierarchy)} />
    </div>
  );
}

export function GraphicOld({ hierarchy }: { hierarchy?: Hierarchy }) {
  const ref = useRef<SVGSVGElement>(null);

  // const data = useSelector((s: AppState) =>
  //   schema.snapshot.selectById(s, { id: tick }),
  // );

  console.log({ hierarchy });

  useEffect(() => {
    chart(ref.current, hierarchy);
  }, [hierarchy]);

  return (
    <svg ref={ref} width={"100%"}>
      <title>Tasks graph</title>
      <g className="nodes" />
      <g className="links" />
    </svg>
  );
}

function textValue(node: d3.HierarchyNode<Hierarchy>) {
  return `${node.data.id} [${node.data.data["@effectionx/inspector.labels"]?.name}]`;
}

function chart(ref: SVGSVGElement | null, data: Hierarchy) {
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

  svg
    .attr("width", width)
    .attr("height", height)
    .attr("viewBox", [-dy / 3, x0 - dx, width, height])
    .attr("style", "max-width: 100%; height: auto; font: 10px sans-serif;");

  svg
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

  console.log(root.descendants());
  const node = svg
    .select("g.nodes")
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

  const circle = node
    .selectAll("circle")
    .filter((d) => `#g-${d.data.id}`)
    .data((d, i) => {
      console.log({ d, i });
      return d;
    })
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
    .attr("fill", (d) => (d.children ? "#555" : "#999"))
    .attr("r", 2.5);

  node
    .selectAll("text")
    .filter((d) => `#g-${d.data.id}`)
    .data((d) => {
      console.log({ textD: d });
      return d;
    })
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
    .attr("x", (d) => (d.children ? -6 : 6))
    .attr("text-anchor", (d) => (d.children ? "end" : "start"))
    .text((d) => textValue(d))
    .attr("opacity", 1)
    .attr("fill", themeBasedFill("white", "black"))
    .attr("paint-order", "fill");
}
