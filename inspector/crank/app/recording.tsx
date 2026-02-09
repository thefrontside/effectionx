import { type Context } from "@b9g/crank";
import { Layout } from "./layout.tsx";
import { router } from "../src/router.ts";

import {
  createScope,
  each,
  createSignal,
  until,
  type Operation,
} from "effection";
import { type Recording } from "./data/recording.ts";
import type { NodeMap } from "./data/types.ts";
import { RenderRecording } from "./components/render-recording.tsx";

export async function* Recording(this: Context): AsyncGenerator<Element> {
  const { state } = router.location;

  let [scope, destroy] = createScope();

  // signal for incoming files
  const files = createSignal<File, never>();
  let nodeMap: NodeMap[] = [];
  // runs on first render if we navigated here with a file in the router state
  if (state?.file) {
    console.log("Received file from router state:", state.file);
    nodeMap = JSON.parse(await state.file.text()) as NodeMap[];
  }

  let refresh = this.refresh.bind(this);

  // process incoming files
  scope.run(function* (): Operation<void> {
    for (let file of yield* each(files)) {
      try {
        const text = yield* until(file.text());
        const json: NodeMap[] = JSON.parse(text);

        refresh(() => (nodeMap = json));
      } catch (e) {
        console.error("Error processing recording file:", e);
      }
    }
  });

  // file input handler to support manual upload from the Recording page
  // TODO add a file input element to the Recording page UI
  const handleFileSelect = (e: Event) => {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    if (file) {
      files.send(file);
    }
  };

  try {
    for ({} of this) {
      yield (
        <Layout>
          <RenderRecording nodeMap={nodeMap} />
        </Layout>
      );
    }
  } finally {
    await destroy();
  }
}
