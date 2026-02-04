import type { Context } from "@b9g/crank";
import { Layout } from "../../layout.tsx";

import { createScope, each, type Operation } from "effection";
import { pipe } from "remeda";
import { arrayLoader, useRecording } from "../../data/recording.ts";
import type { Recording } from "../../data/recording.ts";
import { stratify } from "../../data/stratify.ts";
import type { Hierarchy, NodeMap } from "../../data/types.ts";
import { TreeView } from "../../components/hierarchy-view.tsx";
import { Details } from "../../components/hierarchy-details.tsx";
import { PlaybackControls } from "../../components/playback-controls.tsx";

import json from "./pipeline.json" with { type: "json" };

export async function* Demo(this: Context): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();

  let hierarchy: Hierarchy = { children: [], id: "initial", data: {} };
  let stratum = { root: hierarchy, nodes: {}, hierarchies: { [hierarchy.id]: hierarchy } };
  let recording: Recording | null = null;
  let offset = 0;
  let tickIntervalMs = 250;

  let selectedTree: Hierarchy = stratum.root;

  let refresh = (fn?: () => void) => this.refresh(fn);

  scope.run(function* (): Operation<void> {
    recording = yield* useRecording(arrayLoader(json as unknown as NodeMap[]));

    const hierarchies = pipe(recording.replayStream(), stratify());

    for (stratum of yield* each(hierarchies)) {
      hierarchy = stratum.root;
      refresh();
      yield* each.next();
    }
  });

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
        </Layout>
      );
    }
  } finally {
    await destroy();
  }
}
