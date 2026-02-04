import type { Context } from "@b9g/crank";
import { pipe } from "remeda";
import { Layout } from "./layout.tsx";

import { updateNodeMap } from "./data/update-node-map.ts";
import { stratify } from "./data/stratify.ts";
import { createSSEClient } from "../../lib/sse-client.ts";
import { protocol as scope } from "../../scope/protocol.ts";
import { protocol as player } from "../../player/protocol.ts";
import { combine } from "../../lib/combine.ts";
import { createScope, each, type Operation } from "effection";
import type { Hierarchy } from "./data/types.ts";
import { TreeView } from "./components/hierarchy-view.tsx";
import { Details } from "./components/hierarchy-details.tsx";

const protocol = combine.protocols(scope, player);

const client = createSSEClient(protocol);

const hiearchies = pipe(
  client.methods.watchScopes(),
  updateNodeMap({}),
  stratify(),
);

export async function* Live(this: Context): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();

  let root: Hierarchy = { children: [], id: "initial", data: {} };

  let stratum = {
    root,
    nodes: {},
    hierarchies: { [root.id]: root },
  };

  let selectedTree = root;

  let refresh = () => this.refresh();

  scope.run(function* (): Operation<void> {
    for (stratum of yield* each(hiearchies)) {
      refresh();
      yield* each.next();
    }
  });

  this.addEventListener("sl-selection-change", (e) => {
    let [item] = e.detail.selection;
    let id = item.dataset.id!;
    this.refresh(() => (selectedTree = stratum.hierarchies[id]!));
  });

  // TODO upstream stratum changes to Details view would match this
  // <TreeView slot="start" hierarchy={stratum.root} />
  // <Details slot="end">
  //   <pre>{JSON.stringify(selectedTree, null, 2)}</pre>
  // </Details>

  try {
    for ({} of this) {
      yield (
        <Layout>
          <sl-split-panel position="15">
            <TreeView slot="start" hierarchy={stratum.root} />
            <Details slot="end" node={selectedTree} hierarchy={stratum.root} />
          </sl-split-panel>
        </Layout>
      );
    }
  } finally {
    await destroy();
  }
}
