import { createSSEClient } from "./lib/sse-client.ts";
import { protocol } from "./scope/protocol.ts";
import { pipe } from "remeda";
import { each, main } from "effection";
import { updateNodeMap } from "./ui/data/update-node-map.ts";
import { stratify } from "./ui/data/stratify.ts";

await main(function* () {
  let client = createSSEClient(protocol, {
    url: `http://localhost:41000`,
  });

  let pipeline = pipe(
    // live events
    client.methods.watchScopes(),

    // events -> nodemap
    updateNodeMap({}),

    //    nodemap -> tree
    //stratify(),
  );

  console.log("[");
  for (let item of yield* each(pipeline)) {
    console.log(JSON.stringify(item, null, 2));
    yield* each.next();
    console.log(`,`);
  }
  console.log("]");
});
