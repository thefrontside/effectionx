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
import { createConnection, type ConnectionState } from "./data/connection.ts";
import { Toolbar } from "./toolbar.tsx";
import styles from "./live.module.css";

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
      let status = <Status state={state} />;
      switch (state.type) {
        case "pending":
          yield status;
          break;
        case "failed":
          yield (
            <>
              <Toolbar>
                <Status state={state} />
              </Toolbar>
              {state.error}
            </>
          );
          break;
        case "closed":
        case "live":
          yield (
            <>
              <Toolbar>
                <Status state={state} />
              </Toolbar>
              <StructureInspector structure={state.latest} />
            </>
          );
          break;
      }
    }
  } finally {
    await destroy();
  }
}

function Status({ state }: { state: ConnectionState<unknown, unknown> }) {
  if (state.type === "live") {
    return (
      <>
        <sl-badge variant="neutral">connection</sl-badge>
        <sl-badge variant="success" pulse>
          live
        </sl-badge>
        <sl-icon-button
          name="play-btn"
          label="Start"
          class={styles.startButton}
          onclick={() => {
            fetch("/play", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: "[]",
            })
              .then((r) => {
                if (!r.ok) {
                  console.error("play request failed", r.status, r.statusText);
                } else {
                  console.log("play request succeeded", r);
                }
              })
              .catch((err) => console.error("play request failed", err));
          }}
        ></sl-icon-button>
      </>
    );
  } else if (state.type === "closed") {
    if (state.result.ok) {
      return (
        <>
          <sl-badge variant="neutral">connection</sl-badge>
          <sl-badge variant="primary" pulse={false}>
            done
          </sl-badge>
        </>
      );
    } else {
      let error = state.result.error;
      if (error.message === "connection closed") {
        return (
          <>
            <sl-badge variant="neutral">connection</sl-badge>
            <sl-badge variant="primary" pulse={false}>
              done
            </sl-badge>
          </>
        );
      }
      return (
        <>
          <sl-badge variant="neutral">connection</sl-badge>
          <sl-tooltip
            content={`${error.name}: ${error.message}`}
            placement="bottom-start"
          >
            <sl-badge variant="danger" pulse={false}>
              error
            </sl-badge>
          </sl-tooltip>
        </>
      );
    }
  } else if (state.type === "failed") {
    return (
      <>
        <sl-badge variant="neutral">connection</sl-badge>
        <sl-badge variant="warning" pulse={false}>
          failed
        </sl-badge>
      </>
    );
  } else {
    return (
      <>
        <sl-badge variant="neutral">connection</sl-badge>
        <sl-badge variant="neutral" pulse>
          connecting
        </sl-badge>
      </>
    );
  }
}
