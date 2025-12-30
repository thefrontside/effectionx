import { scope } from "arktype";
import { createProtocol } from "../lib/mod.ts";

const schema = scope({
  ContextData: {
    values: "object.json",
  },
  ContextNode: {
    data: "ContextData",
    children: "ContextNode[]",
  },
  None: "never[]",
}).export();

export type ContextData = typeof schema.ContextData.infer;

export type ContextNode = typeof schema.ContextNode.infer;

export const protocol = createProtocol({
  readContextTree: {
    args: schema.None,
    progress: schema.None,
    returns: schema.ContextNode,
  },
});
