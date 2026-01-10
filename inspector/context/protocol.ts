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
  TaskEvent: () =>
    $.type.or({
      type: "'started'",
      id: "string",
      parentId: "string",
    }, {
      type: "'result'",
      id: "string",
      result: $.type.or({
	ok: "true",
	value: "object.json",
      }, {
	ok: "false",
	error: {
	  name: "string",
	  message: "string",
	  stack: "string?",
	}
      }),
    }),
  ScopeEvent: () =>
    $.type.or({
      type: "'init'",
      data: "ContextData",
      parent: "string | undefined",
    }, {
      type: "'set'",
      context: { name: "string" },
      value: "object.json",
      data: "ContextData",
    }, {
      type: "'delete'",
      context: { name: "string" },
      data: "ContextData",
    }),
  Never: "never",
  None: "never[]",
});

const schema = $.export();

export type ContextData = typeof schema.ContextData.infer;

export type ContextNode = typeof schema.ContextNode.infer;

export type ScopeEvent = typeof schema.ScopeEvent.infer;

export type TaskEvent = typeof schema.TaskEvent.infer;

export const protocol = createProtocol({
  readContextTree: {
    args: schema.None,
    progress: schema.None,
    returns: schema.ContextNode,
  },
  watchTaskTree: {
    args: schema.None,
    progress: schema.TaskEvent,
    returns: schema.Never,
  },
  watchContextTree: {
    args: schema.None,
    progress: schema.ScopeEvent,
    returns: schema.Never,
  },
});
