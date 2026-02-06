import type { Context } from "@b9g/crank";
import { pipe } from "remeda";
import { Layout } from "./layout.tsx";

import { updateNodeMap } from "./data/update-node-map.ts";
import { stratify, type Stratification } from "./data/stratify.ts";
import { createSSEClient } from "../../lib/sse-client.ts";
import { protocol as scope } from "../../scope/protocol.ts";
import { protocol as player } from "../../player/protocol.ts";
import { combine } from "../../lib/combine.ts";
import { createScope, each, type Operation } from "effection";
import { StructureInspector } from "./components/structure-inspector.tsx";
import { raf, sample } from "./data/sample.ts";

const protocol = combine.protocols(scope, player);

const client = createSSEClient(protocol);

const hierarchies = pipe(
  client.methods.watchScopes(),
  updateNodeMap({}),
  sample(raf()),
  stratify(),
);

export async function* Live(this: Context): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();

  let props: { structure?: Stratification } = {};

  let refresh = this.refresh.bind(this);

  scope.run(function* (): Operation<void> {
    for (let structure of yield* each(hierarchies)) {
      refresh(() => (props.structure = structure));
      yield* each.next();
    }
  });

  try {
    for ({} of this) {
      yield (
        <Layout>
          <StructureInspector structure={props.structure} />
        </Layout>
      );
    }
  } finally {
    await destroy();
  }
}
