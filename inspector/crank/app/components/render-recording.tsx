import { Fragment, type Context } from "@b9g/crank";

import { createScope, each, type Operation } from "effection";
import { pipe } from "remeda";
import { arrayLoader, useRecording } from "../data/recording.ts";
import type { Recording } from "../data/recording.ts";
import { raf, sample } from "../data/sample.ts";
import { stratify } from "../data/stratify.ts";
import type { NodeMap } from "../data/types.ts";
import { PlaybackControls } from "../components/playback-controls.tsx";
import type { Stratification } from "../data/stratify.ts";
import { StructureInspector } from "./structure-inspector.tsx";

export async function* RenderRecording(
  { nodeMap }: { nodeMap: NodeMap[] },
  ctx: Context,
): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();

  let props: { structure?: Stratification } = {};

  let $recording = Promise.withResolvers<Recording>();

  scope.run(function* (): Operation<void> {
    let recording = yield* useRecording(arrayLoader(nodeMap));

    $recording.resolve(recording);

    const hierarchies = pipe(
      recording.replayStream(),
      sample(raf()),
      stratify(),
    );

    for (let structure of yield* each(hierarchies)) {
      ctx.refresh(() => (props.structure = structure));
      yield* each.next();
    }
  });

  let recording = await $recording.promise;

  try {
    for ({} of ctx) {
      yield (
        <Fragment>
          <PlaybackControls recording={recording} />
          <StructureInspector structure={props.structure} />
        </Fragment>
      );
    }
  } finally {
    await destroy();
  }
}
