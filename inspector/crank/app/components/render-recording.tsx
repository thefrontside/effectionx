import { Fragment, type Context } from "@b9g/crank";

import {
  resource,
  type Subscription,
} from "effection";
import { pipe } from "remeda";
import { arrayLoader, useRecording } from "../data/recording.ts";
import type { Recording } from "../data/recording.ts";
import { raf, sample } from "../data/sample.ts";
import { stratify } from "../data/stratify.ts";
import type { NodeMap } from "../data/types.ts";
import { PlaybackControls } from "../components/playback-controls.tsx";
import type { Stratification } from "../data/stratify.ts";
import { StructureInspector } from "./structure-inspector.tsx";
import { createCrankScope } from "../lib/crank-scope.ts";

export async function* RenderRecording(
  { nodeMap }: { nodeMap: NodeMap[] },
  ctx: Context,
): AsyncGenerator<Element> {
  let scope = createCrankScope(ctx);
  let $recording = Promise.withResolvers<Recording>();

  let structure = scope.bind(
    resource<Subscription<Stratification, void>>(function* (provide) {
      let recording = yield* useRecording(arrayLoader(nodeMap));
      $recording.resolve(recording);

      const hierarchies = pipe(
        recording.replayStream(),
        sample(raf()),
        stratify(),
      );

      yield* provide(yield* hierarchies);
    }),
    { root: { id: "Global", children: [], data: {} }, hierarchies: {} },
  );

  let recording = await $recording.promise;

  for ({} of ctx) {
    yield (
      <Fragment>
        <PlaybackControls recording={recording} />
        <StructureInspector structure={structure.value} />
      </Fragment>
    );
  }
}
