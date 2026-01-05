import { createProtocol } from "@effectionx/inspector";
import { type Module, scope } from "arktype";
import type { Protocol, Method } from "@effectionx/inspector";
import type { StandardSchemaV1 } from "@standard-schema/spec";

const contextScope = {
  ContextData: {
    values: "object.json" as const,
  },
  ContextNode: {
    data: "ContextData" as const,
    children: "ContextNode[]" as const,
  },
  None: "never[]" as const,
};
const schema: Module<typeof contextScope> = scope(contextScope).export();

export type ContextData = { values: Record<string, unknown> };

export type ContextNode = { data: ContextData; children: ContextNode[] };

type ContextMethods = { readContextTree: Method<never[], never, ContextNode> };

const methods: ContextMethods = {
  readContextTree: {
    args: schema.None as unknown as StandardSchemaV1<never[], never[]>,
    progress: schema.None as unknown as StandardSchemaV1<never, never>,
    returns: schema.ContextNode as unknown as StandardSchemaV1<
      ContextNode,
      ContextNode
    >,
  },
};

export const protocol: Protocol<ContextMethods> = createProtocol(methods);
