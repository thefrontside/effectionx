import { createSSEClient } from "./lib/sse-client.ts";
import { protocol, type ScopeEvent } from "./scope/protocol.ts";
import { pipe } from "remeda";
import { each, main, type Operation } from "effection";
import { map } from "@effectionx/stream-helpers";
import { reduce } from "./lib/reduce.ts";
import { forEach } from "@effectionx/stream-helpers";



await main(function*() {
  let client = createSSEClient(protocol, {
    url: `http://localhost:41000`,
  });

  let initial: Record<string, Node> = (yield* forEach(function*() {}, client.methods.getScopes())).reduce((nodes, node) => {
    nodes[node.id] = node;
    return nodes
  },{} as Record<string, Node>);
  
  let liveStream = client.methods.watchScopes();

  let pipeline = pipe(
    liveStream,
    updateModel(initial),
    record('recording.effection'),
    stratify(),
  );

  for (let item of yield* each(pipeline)) {
    console.dir(item, { depth: 20 });
    yield* each.next();
  }
});

function updateModel(initial: Record<string, Node>) {
  return reduce(function*(model, item: ScopeEvent) {
    if (item.type === "created") {
      model[item.id] = {
	id: item.id,
	parentId: item.parentId,
	data: {},
      }
    }
    if (item.type === "destroyed") {
      delete model[item.id];
    }
    if (item.type === "set") {
      model[item.id].data[item.contextName] = item.contextValue;
    }
    return model;
  }, initial);
}

function stratify() {
  return map(function*(model: Record<string, Node>): Operation<Hierarchy> {
    let stratii = new Map<string, Hierarchy>();

    let root: Hierarchy = {
      id: "root",
      data: {},
      children: [],
    }

    let orphans: Hierarchy = {
      id: "orphans",
      data: {},
      children: [],
    };

    root.children.push(orphans);

    stratii.set(root.id, root);

    for (let [id, node] of Object.entries(model)) {
      let stratum = stratii.get(id);
      if (!stratum) {
	stratii.set(id, stratum = {
	  id,
	  data: node.data,
	  children: [],
	});
      }
      if (node.parentId === "global") {
	root.children.push(stratum);
      } else {
	let parent = stratii.get(node.parentId) ?? orphans;
	parent.children.push(stratum);	
      }
    }

    return root;
  });
}

interface Node {
  id: string;
  parentId: string | "global";
  data: Record<string, unknown>;
}

interface Hierarchy {
  id: string;
  data: Record<string, unknown>;
  children: Hierarchy[];
}
