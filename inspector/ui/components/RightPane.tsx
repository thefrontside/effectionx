import { Tabs, TabList, Tab, TabPanel } from "@react-spectrum/s2";
import type { Hierarchy } from "../data/types";
import { Graphic } from "./Graphic";
import { DetailsPanel } from "./DetailsPanel";

interface Props {
  hierarchy?: Hierarchy;
  node?: Hierarchy | undefined;
  activeTab: "graph" | "attributes";
  setActiveTab: (t: "graph" | "attributes") => void;
}

export default function RightPane({
  hierarchy,
  node,
  activeTab,
  setActiveTab,
}: Props) {
  return (
    <div className="rightArea">
      <div className="tabsWrap">
        <div className="tabsInner">
          <Tabs
            aria-label="Inspector Tabs"
            selectedKey={activeTab}
            onSelectionChange={(key: string | number | null) => {
              if (typeof key === "string") {
                if (key === "graph" || key === "attributes") {
                  setActiveTab(key as "graph" | "attributes");
                } else {
                  console.warn("Unexpected tab key", key);
                }
              }
            }}
          >
            <TabList>
              <Tab id="graph">Graph</Tab>
              <Tab id="attributes">Attributes</Tab>
            </TabList>

            <TabPanel id="graph">
              <div className="tabPanelContent">
                <div className="graphWrap">
                  <Graphic hierarchy={hierarchy} />
                </div>
              </div>
            </TabPanel>

            <TabPanel id="attributes">
              <div className="tabPanelContent">
                <div className="detailsWrap">
                  <DetailsPanel node={node} hierarchy={hierarchy} />
                </div>
              </div>
            </TabPanel>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
