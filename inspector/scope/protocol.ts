import { scope } from "arktype";
import { createProtocol } from "../lib/mod.ts";

const $ = scope({
  ScopeNode: {
    id: "string",
    "parentId?": "string",
    data: "Record<string, object.json>",
  },
  ScopeTree: "ScopeNode[]",
  Error: {
    name: "string",
    message: "string",
    stack: "string?",
  },
  Result: () =>
    $.type.or(
      {
        ok: "true",
      },
      {
        ok: "false",
        error: "Error",
      },
    ),
  ScopeEvent: () =>
    $.type.or(
      {
        type: "'tree'",
        value: "ScopeTree",
      },
      {
        type: "'created'",
        id: "string",
        parentId: "string",
      },
      {
        type: "'destroying'",
        id: "string",
      },
      {
        type: "'destroyed'",
        id: "string",
        result: "Result",
      },
      {
        type: "'set'",
        id: "string",
        contextName: "string",
        contextValue: "object.json",
      },
      {
        type: "'delete'",
        id: "string",
        contextName: "string",
        didHave: "boolean",
      },
    ),
  Never: "never",
  None: "never[]",
  Undef: "undefined",
});

const schema = $.export();

export type ScopeEvent = typeof schema.ScopeEvent.infer;
export type ScopeNode = typeof schema.ScopeNode.infer;
export type ScopeTree = typeof schema.ScopeTree.infer;

export const protocol = createProtocol({
  watchScopes: {
    args: schema.None,
    progress: schema.ScopeEvent,
    returns: schema.Undef,
  },
  getScopes: {
    args: schema.None,
    progress: schema.Never,
    returns: schema.ScopeTree,
  },
});
