import { useEffect, useState } from "react";
import LeftPane from "./LeftPane";
import RightPane from "./RightPane";
import type { Hierarchy } from "../data/types";

type InspectorProps = {
  hierarchy?: Hierarchy;
};

export default function Inspector({ hierarchy }: InspectorProps) {
  // which tab is active in the right pane (logical name)
  const [activeTab, setActiveTab] = useState<"graph" | "attributes">("graph");

  // TODO remove event emitter
  useEffect(() => {
    const onReveal = (event: Event) => {
      setActiveTab("attributes");
    };
    window.addEventListener(
      "inspector:reveal-attributes",
      onReveal as EventListener,
    );
    return () =>
      window.removeEventListener(
        "inspector:reveal-attributes",
        onReveal as EventListener,
      );
  }, []);

  return (
    <div className="mainContent">
      <LeftPane hierarchy={hierarchy} />
      <RightPane
        hierarchy={hierarchy}
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />
    </div>
  );
}
