import { Context, type Children } from "@b9g/crank";
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
import { getNodeLabel } from "./data/labels.ts";

const protocol = combine.protocols(scope, player);

const client = createSSEClient(protocol);

const hiearchies = pipe(
  client.methods.watchScopes(),
  updateNodeMap({}),
  stratify(),
);

export async function* Live(this: Context): AsyncGenerator<Element> {
  let [scope, destroy] = createScope();

  let hierarchy: Hierarchy = { children: [], id: "initial", data: {} };

  let selectedNode = "Nothing Selected";

  let refresh = () => this.refresh();

  scope.run(function* (): Operation<void> {
    for (hierarchy of yield* each(hiearchies)) {
      refresh();
      yield* each.next();
    }
  });

  this.addEventListener("sl-selection-change", (e) => {
    let [item] = e.detail.selection;
    let id = item.dataset.id;
    this.refresh(() => (selectedNode = `Selected Node: ${id}`));
  });

  try {
    for ({} of this) {
      yield (
        <Layout>
          <sl-split-panel position="15">
            <TreeView slot="start" hierarchy={hierarchy} />
            <Details slot="end">{selectedNode}</Details>
          </sl-split-panel>
        </Layout>
      );
    }
  } finally {
    await destroy();
  }
}

function TreeView({
  hierarchy,
  slot,
}: { hierarchy: Hierarchy; slot?: string }) {
  return (
    <sl-tree slot={slot}>
      <TreeNode hierarchy={hierarchy} />
    </sl-tree>
  );
}

function TreeNode({ hierarchy }: { hierarchy: Hierarchy }): Element {
  return (
    <sl-tree-item key={hierarchy.id} selection="single" data-id={hierarchy.id}>
      {getNodeLabel(hierarchy)}
      {hierarchy.children.map((h) => (
        <TreeNode hierarchy={h} />
      ))}
    </sl-tree-item>
  );
}

function Details({ slot, children }: { slot?: string; children: Children }) {
  return <div slot={slot}>{children}</div>;
}
