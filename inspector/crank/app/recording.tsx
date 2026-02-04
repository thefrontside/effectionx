import { Fragment, type Children, type Context } from "@b9g/crank";
import { Layout } from "./layout.tsx";

import {
  createScope,
  each,
  createSignal,
  until,
  type Operation,
} from "effection";
import { pipe } from "remeda";
import { arrayLoader, useRecording, type Recording } from "./data/recording.ts";
import { stratify } from "./data/stratify.ts";
import type { Hierarchy } from "./data/types.ts";
import { getNodeLabel } from "./data/labels.ts";

export async function* Recording(this: Context): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();

  // signal for incoming files
  const files = createSignal<File, never>();

  let recording: null | Recording = null;
  let hierarchy: Hierarchy = { children: [], id: "initial", data: {} };
  let selectedNode = "Nothing Selected";

  let offset = 0;
  let playing = false;
  let tickIntervalMs = 250;

  let refresh = () => this.refresh();

  // process incoming files
  scope.run(function* (): Operation<void> {
    for (let file of yield* each(files)) {
      try {
        const text = yield* until(file.text());
        const json = JSON.parse(text);

        recording = yield* useRecording(arrayLoader(json));

        // initialize offset
        offset = 0;

        // stream hierarchies and refresh view on each tick
        const hierarchies = pipe(recording.replayStream(), stratify());

        // run a task to step through the replay stream and update hierarchy
        for (let item of yield* each(hierarchies)) {
          hierarchy = item;
          console.log("Updated hierarchy:", hierarchy);
          refresh();
          yield* each.next();
        }
      } catch (e) {
        console.error("Error processing recording file:", e);
      }
    }
  });

  // listen for upload events dispatched by Home
  const onUpload = (e: Event) => {
    const file = (e as CustomEvent).detail?.file as File | undefined;
    if (file) files.send(file);
  };

  window.addEventListener(
    "inspector-recording-upload",
    onUpload as EventListener,
  );

  // file input handler to support manual upload from the Recording page
  const handleFileSelect = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      files.send(file);
    }
  };

  this.addEventListener("sl-selection-change", (e) => {
    let [item] = e.detail.selection;
    let id = item.dataset.id;
    this.refresh(() => (selectedNode = `Selected Node: ${id}`));
  });

  try {
    for ({} of this) {
      yield (
        <Layout>
          {!recording ? (
            <section class="grid">
              <div class="card">
                <div class="card-head">
                  <h3>No recording loaded</h3>
                  <div class="card-text">
                    Load a previously recorded session to inspect and play back
                    events.
                  </div>
                </div>

                <div class="footer">
                  <div class="recording-upload">
                    <input
                      id="recording-file-input"
                      type="file"
                      class="hidden-file-input"
                      onchange={handleFileSelect}
                      accept=".json,.effection,application/json,text/json"
                      aria-label="Upload recording file"
                    />
                    <sl-button
                      type="button"
                      variant="primary"
                      onclick={() =>
                        (
                          document.getElementById(
                            "recording-file-input",
                          ) as HTMLInputElement
                        ).click()
                      }
                    >
                      Browse files
                    </sl-button>
                    <div class="meta">.json, .effection files</div>
                  </div>
                </div>
              </div>
            </section>
          ) : (
            <Fragment>
              <div class="controls">
                <sl-button
                  type="button"
                  variant="default"
                  onclick={() => {
                    playing = !playing;
                    this.refresh();
                  }}
                >
                  {playing ? "Pause" : "Play"}
                </sl-button>
                <label>
                  Offset:{" "}
                  <input
                    type="range"
                    min="0"
                    max={recording?.length - 1 || 0}
                    value={offset}
                    onInput={(e: Event) => {
                      offset = Number(
                        (e.currentTarget as HTMLInputElement).value,
                      );
                      recording?.setOffset(offset);
                      this.refresh();
                    }}
                  />
                </label>
              </div>

              <sl-split-panel position="15">
                <TreeView slot="start" hierarchy={hierarchy} />
                <Details slot="end">{selectedNode}</Details>
              </sl-split-panel>
            </Fragment>
          )}
        </Layout>
      );
    }
  } finally {
    await destroy();
  }
}

function TreeView({
  hierarchy,
  slot,
}: {
  hierarchy: Hierarchy;
  slot?: string;
}) {
  return (
    <sl-tree slot={slot}>
      <TreeNode hierarchy={hierarchy} />
    </sl-tree>
  );
}

function TreeNode({ hierarchy }: { hierarchy: Hierarchy }): Element {
  return (
    <sl-tree-item key={hierarchy.id} selection="single" data-id={hierarchy.id}>
      {getNodeLabel(hierarchy)}
      {hierarchy.children.map((h) => (
        <TreeNode hierarchy={h} />
      ))}
    </sl-tree-item>
  );
}

function Details({ slot, children }: { slot?: string; children: Children }) {
  return <div slot={slot}>{children}</div>;
}
