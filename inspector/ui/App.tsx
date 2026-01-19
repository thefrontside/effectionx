import { Tabs, TabList, Tab, TabPanel } from "@react-spectrum/s2";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import Home from "@react-spectrum/s2/illustrations/gradient/generic2/Home";
import Folder from "@react-spectrum/s2/illustrations/gradient/generic2/FolderOpen";
import Search from "@react-spectrum/s2/illustrations/gradient/generic2/Search";
import Settings from "@react-spectrum/s2/illustrations/gradient/generic1/GearSetting";
import { Fragment } from "react";
import { Graphic } from "./components/Graphic";
import { DataList } from "./components/DataList";

function App() {
  return (
    <Tabs aria-label="Tabs" styles={style({ minWidth: 250 })}>
      <TabList aria-label="Tabs">
        <Tab id="tree">Tree</Tab>
        <Tab id="vis">Visualize</Tab>
      </TabList>
      <TabPanel id="tree">
        <DataList />
      </TabPanel>
      <TabPanel id="vis">
        <Graphic />
      </TabPanel>
    </Tabs>
  );
}

export default App;
