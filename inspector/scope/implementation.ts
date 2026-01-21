import type { Inspector } from "@effectionx/inspector";
import { createImplementation, toJson } from "@effectionx/inspector";
import { createContext, createSignal } from "effection";
import { api } from "effection/experimental";
import { protocol, type ScopeEvent } from "./protocol.ts";

const Id = createContext<string>("@effectionx/inspector.id", "global");

export const scope = createImplementation(protocol, function* () {
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
	let value =  yield* next(scope);
	send({ type: "destroyed", id, result: { ok: true, value: toJson(value) }});
      } catch (error) {
	let { name, message, stack } = error as Error;
	send({ type: "destroyed", id, result: { ok: false, error: { name, message, stack }}});
	throw error;
      }
    }
  });

  return {
    watchScopes: () => stream,
  };
}) as Inspector<typeof protocol.methods>;
