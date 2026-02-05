import type { Context, Element } from "@b9g/crank";
import { Layout } from "./layout.tsx";
import type { NodeMap } from "./data/types.ts";
import { RenderRecording } from "./components/render-recording.tsx";
import json from "./demo.json" with { type: "json" };

export function* Demo(this: Context): Generator<Element> {
  const nodeMap = json as unknown as NodeMap[];

  for ({} of this) {
    console.log("Demo rendering with nodeMap:", nodeMap);
    yield (
      <Layout>
        <RenderRecording nodeMap={nodeMap} />
      </Layout>
    );
  }
}
