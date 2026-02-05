import { type Context } from "@b9g/crank";
import { Layout } from "./layout.tsx";

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
  let [scope, destroy] = createScope();

  // signal for incoming files
  const files = createSignal<File, never>();
  let nodeMap: NodeMap[] = [];

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

  // listen for upload events dispatched by Home
  const onUpload = (e: Event) => {
    const file = (e as CustomEvent).detail?.file as File | undefined;
    if (file) files.send(file);
  };

  this.addEventListener(
    "inspector-recording-upload",
    onUpload as EventListener,
  );

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
