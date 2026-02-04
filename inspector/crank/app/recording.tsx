import { Fragment, type Context } from "@b9g/crank";
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
import { TreeView } from "./components/hierarchy-view.tsx";
import { Details } from "./components/hierarchy-details.tsx";
import { PlaybackControls } from "./components/playback-controls.tsx";
import layoutStyles from "./layout.module.css";
import cardStyles from "./components/card.module.css";
import homeStyles from "./home.module.css";

export async function* Recording(this: Context): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();

  // signal for incoming files
  const files = createSignal<File, never>();

  let recording: null | Recording = null;
  let hierarchy: Hierarchy = { children: [], id: "initial", data: {} };
  let stratum = {
    root: hierarchy,
    nodes: {},
    hierarchies: { [hierarchy.id]: hierarchy },
  };
  let selectedTree: Hierarchy = stratum.root;

  let offset = 0;
  let tickIntervalMs = 250;

  let refresh = (fn?: () => void) => this.refresh(fn);

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
        for (stratum of yield* each(hierarchies)) {
          hierarchy = stratum.root;
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
    this.refresh(() => {
      if (id) selectedTree = stratum.hierarchies[id]!;
    });
  });

  // Respond to entity-row activations from Details component
  window.addEventListener("inspector-navigate", (e: Event) => {
    const id = (e as CustomEvent).detail?.id as string | undefined;
    if (id) {
      this.refresh(() => {
        selectedTree = stratum.hierarchies[id]!;
      });
    }
  });

  try {
    for ({} of this) {
      yield (
        <Layout>
          {!recording ? (
            <section class={layoutStyles.grid}>
              <sl-card>
                <div class={cardStyles.cardHead} slot="header">
                  <h3>No recording loaded</h3>
                  <div class={cardStyles.cardText}>
                    Load a previously recorded session to inspect and play back
                    events.
                  </div>
                </div>

                <div class={layoutStyles.footer}>
                  <div class={homeStyles.recordingUpload}>
                    <input
                      id="recording-file-input"
                      type="file"
                      class={homeStyles.hiddenFileInput}
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
                    <div class={homeStyles.meta}>.json, .effection files</div>
                  </div>
                </div>
              </sl-card>
            </section>
          ) : (
            <Fragment>
              <PlaybackControls
                recording={recording}
                offset={offset}
                setOffset={(n: number) => {
                  offset = n;
                }}
                refresh={refresh}
                tickIntervalMs={tickIntervalMs}
              />

              <sl-split-panel position="15">
                <TreeView slot="start" hierarchy={stratum.root} />
                <Details
                  slot="end"
                  node={selectedTree}
                  hierarchy={stratum.root}
                />
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
