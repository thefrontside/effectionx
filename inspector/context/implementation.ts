import { createImplementation, readTree } from "@effectionx/inspector";
import { type Stream, useScope } from "effection";
import { type ContextData, type ContextNode, protocol } from "./protocol.ts";
import type { Inspector } from "@effectionx/inspector";

export const context: Inspector<typeof protocol.methods> = createImplementation(
  protocol,
  function* () {
    let scope = yield* useScope();
    return {
      *readContextTree(): Stream<never, ContextNode> {
        return {
          *next() {
            return {
              done: true,
              value: readTree<ContextData>(scope),
            };
          },
        };
      },
    };
  },
);
