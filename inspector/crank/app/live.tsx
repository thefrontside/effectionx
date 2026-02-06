import type { Context } from "@b9g/crank";
import { pipe } from "remeda";

import { updateNodeMap } from "./data/update-node-map.ts";
import { stratify } from "./data/stratify.ts";
import { createSSEClient } from "../../lib/sse-client.ts";
import { protocol as scope } from "../../scope/protocol.ts";
import { protocol as player } from "../../player/protocol.ts";
import { combine } from "../../lib/combine.ts";
import { createScope, each, type Operation } from "effection";
import { StructureInspector } from "./components/structure-inspector.tsx";
import { createConnection } from "./data/connection.ts";

const protocol = combine.protocols(scope, player);

const client = createSSEClient(protocol);

const hierarchies = pipe(
  client.methods.watchScopes(),
  updateNodeMap({}),
  stratify(),
);

export async function* Live(this: Context): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();

  let connection = createConnection(hierarchies);

  let props = { state: connection.initial };

  let refresh = this.refresh.bind(this);

  scope.run(function* (): Operation<void> {
    for (let state of yield* each(connection)) {
      refresh(() => (props.state = state));
      yield* each.next();
    }
  });

  try {
    for ({} of this) {
      let { state } = props;
      switch (state.type) {
        case "pending":
          yield <h1>Pending</h1>;
          break;
        case "failed":
          yield <h1>Failed: ${state.error}</h1>;
          break;
        case "closed":
          yield <StructureInspector structure={state.latest} />;
          break;
        case "live":
          yield <StructureInspector structure={state.latest} />;
          break;
      }
    }
  } finally {
    await destroy();
  }
}
