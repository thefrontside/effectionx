import { createProtocol } from "@effectionx/inspector";
import { type Module, scope } from "arktype";
import type { Method, Protocol } from "@effectionx/inspector";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import type { Scope as EffectionScope } from "effection";

const contextScope = {
  ContextData: {
    values: "object.json",
  },
  ContextNode: {
    data: "ContextData",
    children: "ContextNode[]",
  },
  WatchArg: {
    interval: "number",
    scope: "object.json",
  },
  WatchArgs: "WatchArg[]",
  None: "never[]",
} as const;
const schema: Module<typeof contextScope> = scope(contextScope).export();

export type ContextData = { values: Record<string, unknown> };

export type ContextNode = { data: ContextData; children: ContextNode[] };

type WatchMethods = {
  watchContextTree: Method<
    { interval?: number; scope?: EffectionScope }[],
    ContextNode,
    never
  >;
};

const methods: WatchMethods = {
  watchContextTree: {
    args: schema.WatchArgs as unknown as StandardSchemaV1<
      { interval?: number }[],
      { interval?: number }[]
    >,
    progress: schema.ContextNode as unknown as StandardSchemaV1<
      ContextNode,
      ContextNode
    >,
    returns: schema.None as unknown as StandardSchemaV1<never, never>,
  },
};

export const protocol: Protocol<WatchMethods> = createProtocol(methods);
