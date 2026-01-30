import TopControls from "../../components/TopControls.tsx";
import LeftPane from "../../components/LeftPane.tsx";
import RightPane from "../../components/RightPane.tsx";

import { useEffect, useMemo, useState } from "react";
import { RecordingUpload } from "../../components/RecordingUpload.tsx";
import { createSignal, each, run, until } from "effection";
import { stratify } from "../../data/stratify.ts";
import { pipe } from "remeda";
import {
  arrayLoader,
  type Recording,
  useRecording,
} from "../../data/recording.ts";
import { box } from "../../data/box.ts";
import type { Hierarchy } from "../../data/types.ts";

import "../AppLayout.css";
import Inspector from "../../components/Inspector.tsx";

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

function Live() {
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
    const first = hierarchy.children?.[0];
    if (first) setSelectedKey(first.id);
  }, [hierarchy, selectedKey]);

  return (
    <div className="appRoot">
      {!recording ? (
        <div className="fullWidthPane">
          <RecordingUpload setFile={setFile} />
        </div>
      ) : (
        <div className="bodyRoot">
          <Inspector hierarchy={hierarchy} />
        </div>
      )}
    </div>
  );
}

export default Live;
