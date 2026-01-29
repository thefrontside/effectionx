import { SearchField } from "@react-spectrum/s2";
import { useState } from "react";
import type { Hierarchy } from "../data/types";
import { HierarchyTree } from "./HierarchyTree";

interface Props {
  hierarchy?: Hierarchy;
}

export default function LeftPane({ hierarchy }: Props) {
  const [filter, setFilter] = useState("");

  return (
    <div className="leftPane">
      <div className="leftPaneInner">
        <div className="leftPaneSearch">
          <SearchField
            placeholder="Filter tree..."
            onChange={(v) => setFilter(v)}
            value={filter}
          />
        </div>
      </div>

      <div className="leftPaneContent">
        <HierarchyTree hierarchy={hierarchy} filter={filter} />
      </div>
    </div>
  );
}
