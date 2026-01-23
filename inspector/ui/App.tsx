import { Tabs, TabList, Tab, TabPanel, Button } from "@react-spectrum/s2";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { useDispatch, useSelector } from "starfx/react";
import { Slider } from "@react-spectrum/s2";

import { Graphic } from "./components/Graphic";
import { DataList } from "./components/DataList";
import { AppState } from "./store/schema";
import { maxTick } from "./store/selector/data-tree";
import { useState } from "react";
import { playEvents } from "./store/thunks";

function App() {
  const dispatch = useDispatch();
  const max = useSelector((s: AppState) => maxTick(s));
  const [tick, setTick] = useState<number>(1);

  return (
    <div>
      <Button onPress={() => dispatch(playEvents())}>Toggle Events</Button>
      <Slider
        label="Event Tick"
        minValue={1}
        maxValue={max}
        value={tick}
        onChange={(v) => setTick(v)}
        formatOptions={{ maximumFractionDigits: 0 }}
      />

      <Tabs aria-label="Tabs" styles={style({ minWidth: 250 })}>
        <TabList aria-label="Tabs">
          <Tab id="tree">Tree</Tab>
          <Tab id="vis">Visualize</Tab>
        </TabList>
        <TabPanel id="tree">
          <DataList tick={tick} />
        </TabPanel>
        <TabPanel id="vis">
          <Graphic tick={tick} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

export default App;
