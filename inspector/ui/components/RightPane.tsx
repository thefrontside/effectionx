import { Tabs, TabList, Tab, TabPanel } from "@react-spectrum/s2";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
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
  function resolveClass(
    c: string | ((props?: Record<string, any>) => string) | undefined,
  ) {
    if (!c) return undefined;
    return typeof c === "function" ? c() : c;
  }

  return (
    <div
      className={resolveClass(
        style({
          flex: 1,
          display: "flex",
          flexDirection: "column",
          minHeight: 0,
          width: "calc(100% - 320px)",
        }),
      )}
    >
      <div
        className={resolveClass(
          style({
            display: "flex",
            flexDirection: "column",
            flex: 1,
            overflow: "hidden",
            minHeight: 0,
          }),
        )}
      >
        <div
          className={`${resolveClass(style({ display: "flex", flexDirection: "column", flex: 1, minHeight: 0 }))} tabsInner`}
        >
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
              <div
                className={resolveClass(
                  style({
                    display: "flex",
                    flex: "1 1 0%",
                    overflow: "hidden",
                    minHeight: 0,
                    minWidth: 0,
                  }),
                )}
              >
                <div
                  className={`${resolveClass(
                    style({
                      flex: "1 1 0%",
                      overflow: "auto",
                      display: "flex",
                      minHeight: 0,
                      minWidth: 0,
                    }),
                  )} graphWrap`}
                >
                  <Graphic hierarchy={hierarchy} />
                </div>
              </div>
            </TabPanel>

            <TabPanel id="attributes">
              <div
                className={resolveClass(
                  style({
                    display: "flex",
                    flex: 1,
                    overflow: "hidden",
                  }),
                )}
              >
                <div
                  className={resolveClass(
                    style({ padding: 12, overflow: "auto" }),
                  )}
                >
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
