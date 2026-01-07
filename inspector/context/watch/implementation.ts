import { createImplementation, readTree } from "@effectionx/inspector";
import {
  createChannel,
  type Scope,
  sleep,
  spawn,
  type Stream,
  useScope,
} from "effection";

import { type ContextData, type ContextNode, protocol } from "./protocol.ts";
import type { Inspector } from "@effectionx/inspector";

function deepEqual(a: unknown, b: unknown) {
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch (_e) {
    return false;
  }
}

export const watch: Inspector<typeof protocol.methods> = createImplementation(
  protocol,
  function* () {
    let scope = yield* useScope();

    return {
      *watchContextTree(
        ...args: { interval?: number; scope?: Scope }[]
      ): Stream<ContextNode, never> {
        let last: ContextNode | undefined;

        const opts = args[0];
        const interval = opts?.interval ?? 100;

        const providedScope = opts?.scope;
        let workingScope: Scope = providedScope ?? scope;

        // create a per-invocation subscriber channel
        const updates = createChannel<ContextNode, never>();

        yield* spawn(function* () {
          while (true) {
            try {
              const current = readTree<ContextData>(workingScope);

              const shouldSend = last === undefined ||
                !deepEqual(current, last);

              if (shouldSend) {
                last = current;
                yield* updates.send(current);
              }
              console.log("looped", { shouldSend, last, current });
            } catch {
              // ignore readTree errors in runtime
            }

            yield* sleep(interval);
          }
        });

        console.log("sending initial value");
        const first = readTree<ContextData>(workingScope);
        yield* updates.send(first);

        const sub = yield* updates;

        return sub;
      },
    };
  },
);
