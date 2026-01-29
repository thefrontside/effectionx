import type { Inspector } from "../lib/mod.ts";
import { createImplementation, toJson } from "../lib/mod.ts";
import { op } from "../lib/impl.ts";
import { createContext, createSignal, type Scope } from "effection";
import { api } from "effection/experimental";
import {
  protocol,
  type ScopeNode,
  type ScopeEvent,
  type ScopeTree,
} from "./protocol.ts";
import { pipe } from "remeda";
import { getLabels, LabelsContext } from "../lib/labels.ts";
import { createSubject } from "@effectionx/stream-helpers";

const Id = createContext<string>("@effectionx/inspector.id", "global");
const Children = createContext<Set<Scope>>(
  "@effection/scope.children",
  new Set(),
);

export const scope = createImplementation(protocol, function* (root) {
  let ids = 0;
  let { send, ...stream } = createSignal<ScopeEvent, never>();

  root.set(LabelsContext, { name: "Global" });

  // give every node an id that does not have it.
  reduce(
    root,
    (_, { scope }) => {
      scope.set(Id, String(ids++));
    },
    null,
  );

  root.decorate(api.Scope, {
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
        yield* next(scope);
        send({
          type: "destroyed",
          id,
          result: { ok: true },
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
    watchScopes: () =>
      pipe(
        stream,
        createSubject<ScopeEvent>({ type: "tree", value: readTree(root) }),
      ),
    getScopes: op(function* () {
      return readTree(root);
    }),
  };
}) as Inspector<typeof protocol.methods>;

function readTree(root: Scope): ScopeTree {
  return reduce(
    root,
    (nodes, { scope, parentId }) => {
      nodes.push({
        id: scope.expect(Id),
        parentId,
        data: { [LabelsContext.name]: getLabels(scope) },
      });
    },
    [] as ScopeNode[],
  );
}

function reduce<T>(
  scope: Scope,
  visitor: (current: T, node: { parentId?: string; scope: Scope }) => T | void,
  initial: T,
): T {
  let sum = initial;
  let visit: Array<{
    parentId?: string;
    scope: Scope;
  }> = [{ scope }];

  let current = visit.pop();
  while (current) {
    let id = current.scope.expect(Id);
    let result = visitor(sum, {
      scope: current.scope,
      parentId: current.parentId,
    });
    if (result != null) {
      sum = result;
    }

    let children = current.scope.expect(Children);
    visit.push(...[...children].map((scope) => ({ scope, parentId: id })));
    current = visit.pop();
  }
  return sum;
}
