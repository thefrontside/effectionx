import type { Inspector } from "../lib/mod.ts";
import { createImplementation, toJson } from "../lib/mod.ts";
import { op } from "../lib/impl.ts";
import { createContext, createSignal, type Scope, useScope } from "effection";
import { api } from "effection/experimental";
import { protocol, type ScopeNode, type ScopeEvent } from "./protocol.ts";
import { getLabels, LabelsContext } from "../lib/labels.ts";

const Id = createContext<string>("@effectionx/inspector.id", "global");
const Children = createContext<Set<Scope>>(
  "@effection/scope.children",
  new Set(),
);

export const scope = createImplementation(protocol, function* () {
  let root = yield* useScope();
  let ids = 0;
  let { send, ...stream } = createSignal<ScopeEvent, never>();

  yield* Id.set(String(ids++));

  yield* api.Scope.decorate({
    create([parent], next) {
      let parentId = parent.expect(Id);
      let [scope, destroy] = next(parent);

      let id = scope.set(Id, String(ids++));

      send({
        type: "created",
        id,
        parentId,
      });
      return [scope, destroy];
    },
    *destroy([scope], next) {
      let id = scope.expect(Id);
      send({ type: "destroying", id });
      try {
        let value = yield* next(scope);
        send({
          type: "destroyed",
          id,
          result: { ok: true, value: toJson(value) },
        });
      } catch (error) {
        let { name, message, stack } = error as Error;
        send({
          type: "destroyed",
          id,
          result: { ok: false, error: { name, message, stack } },
        });
        throw error;
      }
    },

    set([contexts, context, value], next) {
      if (context.name === LabelsContext.name) {
        send({
          type: "set",
          id: String(contexts[Id.name]),
          contextName: context.name,
          contextValue: toJson(value),
        });
      }
      return next(contexts, context, value);
    },
  });

  return {
    watchScopes: () => stream,
    getScopes: op(function* () {
      let scopes: ScopeNode[] = [];
      let visit: Array<{
        parentId: string;
        scope: typeof root;
      }> = [{ scope: root, parentId: "global" }];
      let current = visit.pop();
      while (current) {
        let id = current.scope.expect(Id);
        scopes.push({
          id,
          parentId: current.parentId,
          labels: getLabels(current.scope),
        });
        let children = current.scope.expect(Children);
        visit.push(...[...children].map((scope) => ({ scope, parentId: id })));
        current = visit.pop();
      }
      return scopes;
    }),
  };
}) as Inspector<typeof protocol.methods>;
