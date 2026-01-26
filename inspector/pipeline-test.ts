import { createSSEClient } from "./lib/sse-client.ts";
import { protocol, type ScopeEvent } from "./scope/protocol.ts";
import { pipe } from "remeda";
import { each, main } from "effection";
import { forEach } from "@effectionx/stream-helpers";
import type { NodeMap } from "./ui/data/types.ts";
import { updateNodeMap } from "./ui/data/update-node-map.ts";

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
    //    stratify(),
  );

  console.log('[')
  for (let item of yield* each(pipeline)) {
    console.log(JSON.stringify(item, null, 2));
    yield* each.next();
    console.log(`,`);
  }
  console.log(']')
});
