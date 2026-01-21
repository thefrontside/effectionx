import { scope } from "arktype";
import { createProtocol } from "../lib/mod.ts";

const $ = scope({
  ContextData: {
    id: "string",
    values: "object.json",
  },
  ContextNode: {
    data: "ContextData",
    children: "ContextNode[]",
  },
  Error: {
    name: "string",
    message: "string",
    stack: "string?",
  },
  Result: () =>
    $.type.or(
      {
        ok: "true",
        value: "object.json",
      },
      {
        ok: "false",
        error: "Error",
      },
    ),
  ScopeEvent: () =>
    $.type.or(
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
	contextName: "string",
	contextValue: "object.json",
      }, {
	type: "'delete'",
	contextName: "string",
	didHave: "boolean",
      }
    ),
  Never: "never",
  None: "never[]",
});

const schema = $.export();


export type ScopeEvent = typeof schema.ScopeEvent.infer;

export const protocol = createProtocol({
  watchScopes: {
    args: schema.None,
    progress: schema.ScopeEvent,
    returns: schema.Never,
  },
});
