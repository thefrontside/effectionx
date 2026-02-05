import type { Context } from "@b9g/crank";
import { Layout } from "../../layout.tsx";

import { createScope, each, type Operation } from "effection";
import { pipe } from "remeda";
import { arrayLoader, useRecording } from "../../data/recording.ts";
import type { Recording } from "../../data/recording.ts";
import { stratify, type Stratification } from "../../data/stratify.ts";
import type { NodeMap } from "../../data/types.ts";
import { PlaybackControls } from "../../components/playback-controls.tsx";

import json from "./pipeline.json" with { type: "json" };
import { StructureInspector } from "../../components/structure-inspector.tsx";

export async function* Demo(this: Context): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();

  let props: { structure?: Stratification } = {};

  let $recording = Promise.withResolvers<Recording>();

  let refresh = this.refresh.bind(this);

  scope.run(function* (): Operation<void> {
    let recording = yield* useRecording(
      arrayLoader(json as unknown as NodeMap[]),
    );

    $recording.resolve(recording);

    const hierarchies = pipe(recording.replayStream(), stratify());

    for (let structure of yield* each(hierarchies)) {
      refresh(() => (props.structure = structure));
      yield* each.next();
    }
  });

  let offset = 0;
  let recording = await $recording.promise;

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
          />
          <StructureInspector structure={props.structure} />
        </Layout>
      );
    }
  } finally {
    await destroy();
  }
}
