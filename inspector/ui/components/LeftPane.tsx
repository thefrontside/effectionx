import { SearchField } from "@react-spectrum/s2";
import { useState } from "react";
import { Hierarchy } from "../data/types";
import { HierarchyTree } from "./HierarchyTree";

interface Props {
  hierarchy?: Hierarchy;
  selectedKey?: string;
  onSelectionChange: (key?: string) => void;
}

export default function LeftPane({
  hierarchy,
  selectedKey,
  onSelectionChange,
}: Props) {
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
        <HierarchyTree
          hierarchy={hierarchy}
          selectedKey={selectedKey}
          onSelectionChange={onSelectionChange}
          filter={filter}
        />
      </div>
    </div>
  );
}
