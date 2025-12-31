import { createImplementation, readTree } from "@effectionx/inspector";
import { type Stream, useScope } from "effection";
import { type ContextData, type ContextNode, protocol } from "./protocol.ts";

export const context = createImplementation(protocol, function* () {
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
});
