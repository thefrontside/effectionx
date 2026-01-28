import TopControls from "./components/TopControls";
import LeftPane from "./components/LeftPane";
import RightPane from "./components/RightPane";

import { useEffect, useMemo, useState } from "react";
import { RecordingUpload } from "./components/RecordingUpload.tsx";
import { createSignal, each, run, until } from "effection";
import { stratify } from "./data/stratify.ts";
import { pipe } from "remeda";
import { arrayLoader, Recording, useRecording } from "./data/recording.ts";
import { box } from "./data/box.ts";
import { Hierarchy } from "./data/types.ts";

import pipeline from "../pipeline.json";
import "./AppLayout.css";

const isDemo = import.meta.env.VITE_DEMO === "true";

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

  useEffect(() => {
    // Load the demo pipeline fixture when no file was uploaded
    if (!isDemo || recording) return;
    const task = run(function* () {
      const result = yield* box(function* () {
        const r = yield* useRecording(arrayLoader(pipeline as any));
        setRecording(r);
      });
      if (!result.ok) {
        console.error("Error loading pipeline fixture:", result.error);
      }
    });
    return () => {
      task.halt().catch((e) => console.error(e));
    };
  }, [recording]);

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

  const [selectedKey, setSelectedKey] = useState<string | undefined>();

  // playback state
  const [playing, setPlaying] = useState(false);
  const [offset, setOffset] = useState(0);
  const tickIntervalMs = 250;

  // keep offset and recording in sync
  useEffect(() => {
    if (!recording) return;
    // initialize offset to 0 when a recording loads
    setOffset(0);
    recording.setOffset(0);
  }, [recording]);

  // when offset changes by user or timer, update the recording
  useEffect(() => {
    if (!recording) return;
    recording.setOffset(offset);
  }, [offset, recording]);

  // playback auto-advance
  useEffect(() => {
    if (!playing || !recording) return;
    const id = setInterval(() => {
      setOffset((prev) => {
        const next = prev + 1;
        if (recording && next >= recording.length) {
          // stop at end
          setPlaying(false);
          return recording.length - 1;
        }
        return next;
      });
    }, tickIntervalMs);
    return () => clearInterval(id);
  }, [playing, recording]);

  // Auto-select the first top-level child when the hierarchy updates
  useEffect(() => {
    if (!hierarchy) return;
    if (selectedKey) return; // don't override user selection
    const first = hierarchy.children && hierarchy.children[0];
    if (first) setSelectedKey(first.id);
  }, [hierarchy, selectedKey]);

  // which tab is active in the right pane (logical name)
  const [activeTab, setActiveTab] = useState<"graph" | "attributes">("graph");

  // when a row dispatches the reveal event, switch to Attributes tab
  useEffect(() => {
    const onReveal = () => setActiveTab("attributes");
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

  function findNode(root?: Hierarchy, id?: string): Hierarchy | undefined {
    if (!root || !id) return undefined;
    if (root.id === id) return root;
    for (let child of root.children ?? []) {
      const found = findNode(child, id);
      if (found) return found;
    }
    return undefined;
  }

  const selectedNode = selectedKey
    ? findNode(hierarchy, selectedKey)
    : undefined;

  return (
    <div className="appRoot">
      {!recording ? (
        <div className="fullWidthPane">
          <RecordingUpload setFile={setFile} />
        </div>
      ) : (
        <div className="bodyRoot">
          <TopControls
            playing={playing}
            setPlaying={setPlaying}
            offset={offset}
            setOffset={setOffset}
            maxValue={Math.max(0, recording.length - 1)}
            onRefresh={() => {
              if (!recording) return;
              setOffset(0);
              recording.setOffset(0);
              setPlaying(false);
              if (hierarchy?.children?.[0]) {
                setSelectedKey(hierarchy.children[0].id);
              }
              console.log("refresh");
            }}
          />

          <div className="mainContent">
            <LeftPane
              hierarchy={hierarchy}
              selectedKey={selectedKey}
              onSelectionChange={setSelectedKey}
            />
            <RightPane
              hierarchy={hierarchy}
              node={selectedNode}
              activeTab={activeTab}
              setActiveTab={setActiveTab}
            />
          </div>
        </div>
      )}
    </div>
  );
}

export default App;
