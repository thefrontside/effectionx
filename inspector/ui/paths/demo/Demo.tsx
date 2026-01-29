import TopControls from "../../components/TopControls.tsx";

import { useEffect, useMemo, useState } from "react";
import { createSignal, each, run } from "effection";
import { stratify } from "../../data/stratify.ts";
import { pipe } from "remeda";
import { arrayLoader, type Recording, useRecording } from "../../data/recording.ts";
import { box } from "../../data/box.ts";
import type { Hierarchy } from "../../data/types.ts";

import pipeline from "./pipeline.json" with { type: "json" };
import "../AppLayout.css";
import Inspector from "../../components/Inspector.tsx";

function useDemoStream() {
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
    // Load the demo pipeline fixture when no file was uploaded
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
  }, []);

  return {
    setFile: files.send,
    hierarchy,
    recording,
  };
}

function App() {
  const { hierarchy, recording } = useDemoStream();

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

  if (!recording) return null;

  return (
    <div className="appRoot">
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
            console.log("refresh");
          }}
        />
        <Inspector hierarchy={hierarchy} />
      </div>
    </div>
  );
}

export default App;
