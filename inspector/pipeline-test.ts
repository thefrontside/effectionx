import { createSSEClient } from "./lib/sse-client.ts";
import { protocol, type ScopeEvent } from "./scope/protocol.ts";
import { pipe } from "remeda";
import { each, main } from "effection";
import { forEach } from "@effectionx/stream-helpers";
import type { NodeMap } from "./ui/data/types.ts";
import { updateNodeMap } from "./ui/data/update-node-map.ts";
import { stratify } from "./ui/data/stratify.ts";

await main(function* () {
  let client = createSSEClient(protocol, {
    url: `http://localhost:41000`,
  });

  let initial: NodeMap = (yield* forEach(
    function* () {},
    client.methods.getScopes(),
  )).reduce((nodes, node) => {
    nodes[node.id] = node;
    return nodes;
  }, {} as NodeMap);

  let pipeline = pipe(
    // live events
    client.methods.watchScopes(),

    // events -> nodemap
    updateNodeMap(initial),

    // nodemap -> tree
    stratify(),
  );

  for (let item of yield* each(pipeline)) {
    console.dir(item, { depth: 20 });
    yield* each.next();
    console.log(`============================================`);
  }
});
