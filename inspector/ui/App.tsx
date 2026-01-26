import { Tabs, TabList, Tab, TabPanel, Button } from "@react-spectrum/s2";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { useDispatch, useSelector } from "starfx/react";
import { Slider } from "@react-spectrum/s2";

import { Graphic } from "./components/Graphic";
import { DataList } from "./components/DataList";
import { AppState, schema } from "./store/schema";
import { maxTick } from "./store/selector/data-tree";
import { useEffect, useMemo, useState } from "react";
import { playEvents } from "./store/thunks";
import { RecordingUpload } from "./components/RecordingUpload";
import { createSignal, each, run, sleep, spawn, until } from "effection";
import { stratify } from "./data/stratify";
import { pipe } from "remeda";
import { arrayLoader, Recording, useRecording } from "./data/recording";
import { box } from "./data/box";
import { Hierarchy } from "./data/types";

function App() {
  // const dispatch = useDispatch();
  // const max = useSelector(schema.snapshot.selectTableAsList).length;
  const [hierarchy, setHierarchy] = useState<Hierarchy>();
  const [recording, setRecording] = useState<Recording>();

  const files = useMemo(() => {
    return createSignal<File, never>();
  }, []);

  useEffect(() => {
    const task = run(function* () {
      const result = yield* box(function* () {
        for (let file of yield* each(files)) {
          const text = yield* until(file.text());
          const json = JSON.parse(text);

          const recording = yield* useRecording(arrayLoader(json));
          setRecording(recording);
          console.log({ recording });
          yield* sleep(0);
          // TODO the setRecording above doesn't seem to set where we can call it later
          const hierarchies = pipe(recording.replayStream(), stratify());

          console.log({ hierarchies });
          for (let item of yield* each(hierarchies)) {
            console.dir(item, { depth: 20 });
            setHierarchy(item);
          }

          yield* each.next();
        }
      });
      if (!result.ok) {
        console.error("Error processing file:", result.error);
      }
    });
    return () => {
      task.halt().catch((e) => console.error(e));
    };
  }, [files]);

  return (
    <div>
      {/* <Button onPress={() => dispatch(playEvents())}>Toggle Events</Button> */}
      <Slider
        label="Event Tick"
        minValue={0}
        maxValue={recording?.length || 1}
        value={recording?.offset || 0}
        onChange={(v) => recording?.setOffset(v)}
        formatOptions={{ maximumFractionDigits: 0 }}
      />

      <Tabs aria-label="Tabs" styles={style({ minWidth: 250 })}>
        <TabList aria-label="Tabs">
          <Tab id="upload">Upload</Tab>
          {/* <Tab id="tree">Tree</Tab> */}
          <Tab id="vis">Visualize</Tab>
        </TabList>
        <TabPanel id="upload">
          <RecordingUpload setFiles={files.send} />
        </TabPanel>
        {/* <TabPanel id="tree">
          <DataList tick={tick} />
        </TabPanel> */}
        <TabPanel id="vis">
          <Graphic hierarchy={hierarchy} />
        </TabPanel>
      </Tabs>
    </div>
  );
}

export default App;
