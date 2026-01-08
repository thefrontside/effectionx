import type { Inspector } from "@effectionx/inspector";
import { createImplementation, readTree, readContextData } from "@effectionx/inspector";
import { createContext, createSignal, type Stream, useScope } from "effection";
import { api } from "effection/experimental";
import { type ContextData, type ContextNode, protocol } from "./protocol.ts";

export const read: Inspector<typeof protocol.methods> = createImplementation(
  protocol,
  function* () {
    let ids = 0;
    let scope = yield* useScope();
    let signal = createSignal<ContextData, never>();
    let id = createContext<number>("@effectionx/inspector.id");

    yield* api.Scope.decorate({
      init(args, next) {
	let contexts = next(...args);
	contexts[id.name] = ids++;
	return contexts;
      },
      set([contexts, context, value], next) {
        signal.send({
	  id: contexts[id.name] as string,
          values: readContextData(contexts),
        });
        return next(contexts, context, value);
      },
      delete([contexts, context], next) {
        signal.send({
	  id: contexts[id.name] as string,
          values: readContextData(contexts),
        });
	return next(contexts, context);
      }
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
      watchContextTree: () => signal,
    };
  },
);
