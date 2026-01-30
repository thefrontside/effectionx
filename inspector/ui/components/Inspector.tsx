import { useEffect, useMemo, useState } from "react";
import LeftPane from "./LeftPane";
import RightPane from "./RightPane";
import { useParams } from "react-router";
import type { Hierarchy } from "../data/types";
import { findNode } from "../data/findNode";

type InspectorProps = {
  hierarchy?: Hierarchy;
};

export default function Inspector({ hierarchy }: InspectorProps) {
  // which tab is active in the right pane (logical name)
  const [activeTab, setActiveTab] = useState<"graph" | "attributes">("graph");
  const params = useParams();

  useEffect(() => {
    if (params.nodeId) {
      setActiveTab("attributes");
    }
  }, [params.nodeId]);

  const selectedNode = useMemo(() => {
    return findNode(hierarchy, params.nodeId as string | undefined);
  }, [hierarchy, params.nodeId]);

  return (
    <div className="mainContent">
      <LeftPane hierarchy={hierarchy} />
      <RightPane
        hierarchy={hierarchy}
        node={selectedNode}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
}
