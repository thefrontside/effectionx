import type { Inspector } from "@effectionx/inspector";
import { createImplementation, toJson } from "@effectionx/inspector";
import { createContext, createSignal } from "effection";
import { api } from "effection/experimental";
import { protocol, type TaskEvent } from "./protocol.ts";

const Id = createContext<number>("@effectionx/inspector.id");

export const scope: Inspector<typeof protocol.methods> = createImplementation(
  protocol,
  function* () {
    let ids = 0;
    let signal = createSignal<TaskEvent, never>();

    yield* Id.set(ids++);

    yield* api.Task.decorate({
      *run(args, next) {
        let parentId = String((yield* Id.get()) ?? "global");
        let id = String(yield* Id.set(ids++));
        signal.send({
          type: "started",
          id,
          parentId,
        });

        let result: Extract<TaskEvent, { type: "result" }>["result"] = {
          exists: false,
        };

        try {
          let value = yield* next(...args);
          result = {
            exists: true,
            value: { ok: true, value: toJson(value) },
          };

          return value;
        } catch (error) {
          let { name, message, stack } = error as Error;
          result = {
            exists: true,
            value: {
              ok: false,
              error: { name, message, stack },
            },
          };
          throw error;
        } finally {
          signal.send({ type: "result", id, result });
        }
      },
    });

    return {
      watchTasks: () => signal,
    };
  },
);
