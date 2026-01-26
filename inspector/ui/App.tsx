import { Tabs, TabList, Tab, TabPanel, Button } from "@react-spectrum/s2";
import { style } from "@react-spectrum/s2/style" with { type: "macro" };
import { useDispatch, useSelector } from "starfx/react";
import { Slider } from "@react-spectrum/s2";

import { Graphic } from "./components/Graphic";
import { DataList } from "./components/DataList";
import { AppState, schema } from "./store/schema";
import { maxTick } from "./store/selector/data-tree";
import { use, useEffect, useMemo, useState } from "react";
import { playEvents } from "./store/thunks";
import { RecordingUpload } from "./components/RecordingUpload";
import { createSignal, each, run, sleep, spawn, until } from "effection";
import { stratify } from "./data/stratify";
import { pipe } from "remeda";
import { arrayLoader, Recording, useRecording } from "./data/recording";
import { box } from "./data/box";
import { Hierarchy } from "./data/types";

function useRecordingStream() {
  const [hierarchy, setHierarchy] = useState<Hierarchy>();
  const [recording, setRecording] = useState<Recording>();

  const files = useMemo(() => {
    return createSignal<File, never>();
  }, []);

  useEffect(() => {
    if (!recording) return;
    const task = run(function* () {
      const result = yield* box(function* () {
        console.log({ recording });
        const hierarchies = pipe(recording.replayStream(), stratify());
        for (let item of yield* each(hierarchies)) {
          console.dir(item, { depth: 20 });
          setHierarchy(item);
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
  }, [recording]);

  useEffect(() => {
    const task = run(function* () {
      const result = yield* box(function* () {
        for (let file of yield* each(files)) {
          const text = yield* until(file.text());
          const json = JSON.parse(text);

          const recording = yield* useRecording(arrayLoader(json));
          setRecording(recording);

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

  return {
    setFile: files.send,
    hierarchy,
    recording,
  };
}

function App() {
  // const dispatch = useDispatch();
  // const max = useSelector(schema.snapshot.selectTableAsList).length;
  const { hierarchy, recording, setFile } = useRecordingStream();

  return (
    <div>
      {/* <Button onPress={() => dispatch(playEvents())}>Toggle Events</Button> */}
      {!recording ? (
        <RecordingUpload setFile={setFile} />
      ) : (
        <>
          <Slider
            label="Event Tick"
            minValue={0}
            defaultValue={0}
            maxValue={recording.length}
            onChange={(v) => recording.setOffset(v)}
            formatOptions={{ maximumFractionDigits: 0 }}
          />

          <Graphic hierarchy={hierarchy} />
          {/* <Tabs aria-label="Tabs" styles={style({ minWidth: 250 })}>
            <TabList aria-label="Tabs"> */}
          {/* <Tab id="tree">Tree</Tab> */}
          {/* <Tab id="vis">Visualize</Tab>
            </TabList> */}
          {/* <TabPanel id="tree">
          <DataList tick={tick} />
        </TabPanel> */}
          {/* <TabPanel id="vis"></TabPanel> */}
          {/* </Tabs> */}
        </>
      )}
    </div>
  );
}

export default App;
