import type { Inspector } from "@effectionx/inspector";
import {
  createImplementation,
  readContextData,
  readTree,
  toJson,
} from "@effectionx/inspector";
import { createContext, createSignal, type Stream, useScope } from "effection";
import { api } from "effection/experimental";
import {
  type ContextData,
  type ContextNode,
  protocol,
  type ScopeEvent,
  type TaskEvent,
} from "./protocol.ts";

const Id = createContext<number>("@effectionx/inspector.id");

export const scope: Inspector<typeof protocol.methods> = createImplementation(
  protocol,
  function* () {
    let scope = yield* useScope();
    let ids = 0;
    let signal = {
      scope: createSignal<ScopeEvent, never>(),
      task: createSignal<TaskEvent, never>(),
    };

    yield* Id.set(ids++);

    yield* api.Task.decorate({
      *run(args, next) {
        let parentId = String((yield* Id.get()) ?? "global");
        let id = String(yield* Id.set(ids++));
        signal.task.send({
          type: "started",
          id,
          parentId,
        });

        try {
          let value = yield* next(...args);
          signal.task.send({
            type: "result",
            id,
            result: { ok: true, value: toJson(value) },
          });
        } catch (error) {
          let { name, message, stack } = error as Error;
          signal.task.send({
            type: "result",
            id,
            result: { ok: false, error: { name, message, stack } },
          });
          throw error;
        }
      },
    });

    yield* api.Scope.decorate({
      set([contexts, context, value], next) {
        if (context !== Id) {
          signal.scope.send({
            type: "set",
            context: { name: context.name },
            value: String(value),
            data: {
              id: contexts[Id.name] as string,
              values: readContextData(contexts),
            },
          });
        }

        return next(contexts, context, value);
      },
      delete([contexts, context], next) {
        signal.scope.send({
          type: "delete",
          context: { name: context.name },
          data: {
            id: contexts[Id.name] as string,
            values: readContextData(contexts),
          },
        });
        return next(contexts, context);
      },
    });

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
      watchContextTree: () => signal.scope,
      watchTaskTree: () => signal.task,
    };
  },
);
