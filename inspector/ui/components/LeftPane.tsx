import { SearchField } from "@react-spectrum/s2";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { useState } from "react";
import type { Hierarchy } from "../data/types";
import { HierarchyTree } from "./HierarchyTree";

const leftPaneSearchStyle = style({
  paddingBlock: 6,
  flex: 1,
  minWidth: 0,
  selectors: {
    "& input": {
      width: "100%",
      boxSizing: "border-box",
      borderRadius: 18,
      height: 40,
      paddingInlineStart: 40,
      paddingInlineEnd: 12,
      paddingBlock: 0,
      background: "var(--spectrum-global-color-gray-50)",
      border: "1px solid var(--spectrum-global-color-gray-100)",
      outline: "none",
      fontSize: 14,
    },
    "& input::placeholder": { color: "var(--spectrum-global-color-gray-600)" },
    '& [slot="icon"], & svg': {
      position: "relative",
      left: 8,
      zIndex: 2,
      width: 20,
      height: 20,
      pointerEvents: "none",
    },
  },
});

interface Props {
  hierarchy?: Hierarchy;
}

export default function LeftPane({ hierarchy }: Props) {
  const [filter, setFilter] = useState("");

  return (
    <div
      className={style({
        width: 320,
        borderRight: "1px solid var(--spectrum-global-color-gray-100)",
        display: "flex",
        flexDirection: "column",
        minHeight: 0,
      })}
    >
      <div
        className={style({
          paddingBlock: 6,
          paddingInline: 12,
          display: "flex",
          gap: 12,
          alignItems: "center",
          borderBottom: "1px solid var(--spectrum-global-color-gray-100)",
          background: "var(--spectrum-global-color-gray-50)",
          height: 56,
        })}
      >
        <div className={leftPaneSearchStyle}>
          <SearchField
            placeholder="Filter tree..."
            onChange={(v) => setFilter(v)}
            value={filter}
          />
        </div>
      </div>

      <div className={style({ overflow: "auto", flex: 1, minHeight: 0 })}>
        <HierarchyTree hierarchy={hierarchy} filter={filter} />
      </div>
    </div>
  );
}
