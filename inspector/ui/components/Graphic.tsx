import { createRef, useEffect, useState } from "react";
import type { Hierarchy } from "../data/types.ts";
import { Tree, RawNodeDatum } from "react-d3-tree";
import { Labels, LabelsContext } from "../../lib/labels.ts";
import "./Graphic.css";

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

  return hierarchy ? (
    <div id="treeWrapper" ref={ref}>
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
    <div></div>
  );
}

function transform2D3(hierarchy: Hierarchy): RawNodeDatum {
  let { data } = hierarchy;
  let { name, ...attributes } = (data[LabelsContext.name] ??
    LabelsContext.defaultValue) as Labels;
  return {
    name: name as string,
    //@ts-expect-error let us just see
    attributes,
    // to set as proper leaf nodes when no children
    ...(hierarchy.children.length === 0
      ? {}
      : { children: hierarchy.children.map(transform2D3) }),
  };
}
