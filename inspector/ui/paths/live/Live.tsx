import { useEffect, useMemo, useState } from "react";
import { run, type Stream } from "effection";
import { createSSEClient } from "../../../lib/sse-client.ts";
import { stratify } from "../../data/stratify.ts";
import { pipe } from "remeda";
import { protocol } from "../../../scope/protocol.ts";

import "../AppLayout.css";
import Inspector from "../../components/Inspector.tsx";
import { updateNodeMap } from "../../data/update-node-map.ts";

function Live() {
  let stream = useMemo(() => {
    let client = createSSEClient(protocol);

    return pipe(client.methods.watchScopes(), updateNodeMap({}), stratify());
  }, []);

  let next = useEach(stream);
  if (!next.ok) {
    if (next.pending) {
      return <div>connecting...</div>;
    } else {
      return (
        <pre>
          {String(next.error)}\n{(next.error as Error).stack}
        </pre>
      );
    }
  } else if (next.value.done) {
    return <div>connection closed</div>;
  }

  let hierarchy = next.value.value;

  return (
    <div className="appRoot">
      <div className="bodyRoot">
        <Inspector hierarchy={hierarchy} />
      </div>
    </div>
  );
}

export type AsyncResult<T> =
  | {
      pending: true;
      ok: false;
    }
  | {
      pending: false;
      ok: true;
      value: T;
    }
  | {
      pending: false;
      ok: false;
      error: unknown;
    };

export function useEach<T, TClose>(stream: Stream<T, TClose>) {
  let [next, setNext] = useState<AsyncResult<IteratorResult<T, TClose>>>({
    pending: true,
    ok: false,
  });

  useEffect(() => {
    let task = run(function* () {
      let subscription = yield* stream;
      let current = yield* subscription.next();
      console.log({ current });
      while (!current.done) {
        setNext({ pending: false, ok: true, value: current });
        current = yield* subscription.next();
        console.log({ current });
      }
      setNext({ pending: false, ok: true, value: current });
    });
    task.catch((error) => setNext({ pending: false, ok: false, error }));
    return () => {
      task.halt().catch((error) => console.error(error));
    };
  }, [stream]);

  return next;
}

export default Live;
