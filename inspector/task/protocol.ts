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
  TaskEvent: () =>
    $.type.or(
      {
        type: "'pending'",
        id: "string",
        parentId: "string",
      },
      {
        type: "'halting'",
        id: "string",
      },
      {
        type: "'finalized'",
        id: "string",
        result: $.type.or(
          {
            exists: "true",
            value: "Result",
          },
          {
            exists: "false",
          },
        ),
      },
    ),
  Never: "never",
  None: "never[]",
});

const schema = $.export();

export type ContextData = typeof schema.ContextData.infer;

export type ContextNode = typeof schema.ContextNode.infer;

export type TaskEvent = typeof schema.TaskEvent.infer;

export const protocol = createProtocol({
  watchTasks: {
    args: schema.None,
    progress: schema.TaskEvent,
    returns: schema.Never,
  },
});
