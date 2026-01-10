import type { Inspector } from "@effectionx/inspector";
import {
  createImplementation,
  readContextData,
  readTree,
} from "@effectionx/inspector";
import { createContext, createSignal, type Stream } from "effection";
import { api } from "effection/experimental";
import {
  type ContextData,
  type ContextNode,
  protocol,
  type ScopeEvent,
  type TaskEvent,
} from "./protocol.ts";
import { useScope } from "effection";

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
