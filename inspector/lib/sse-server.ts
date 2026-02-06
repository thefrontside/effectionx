import {
  type Operation,
  resource,
  scoped,
  type Task,
  until,
  useAttributes,
  useScope,
} from "effection";
import type { Handle, Methods } from "./types.ts";
import { validateUnsafe } from "./validate.ts";

import { createEventStream, H3, serve } from "h3";

export interface SSEServerOptions {
  port: number;
}

export function useSSEServer<M extends Methods>(
  handle: Handle<M>,
  options: SSEServerOptions,
): Operation<string> {
  let { protocol } = handle;
  let methodNames = Object.keys(protocol.methods) as Array<keyof M>;

  return resource(function* (provide) {
    let { port } = options;
    yield* useAttributes({ name: "SSEServer", port });
    let scope = yield* useScope();

    let app = new H3();

    let inflight = new Set<Task<void>>();

    for (let name of methodNames) {
      app.all(`/${String(name)}`, async (event) => {
        let { req } = event;
        let stream = createEventStream(event);

        let task = scope.run(function* () {
          yield* useAttributes({
            name: "RequestHandler",
            method: req.method,
            pathname: event.url.pathname,
          });
          try {
            yield* scoped(function* () {
              yield* useAttributes({ name: "EventStream" });
              let post = req.method.toUpperCase() === "POST";
              let body: unknown = post ? yield* until(req.json()) : [];
              let args = validateUnsafe(protocol.methods[name].args, body);
              let subscription = yield* handle.invoke({ name, args });
              let next = yield* subscription.next();
              while (!next.done) {
                yield* until(
                  stream.push({
                    event: "yield",
                    data: JSON.stringify(next.value),
                  }),
                );
                next = yield* subscription.next();
              }
              let value = validateUnsafe(
                protocol.methods[name].returns,
                next.value,
              );
              yield* until(
                stream.push({ event: "return", data: JSON.stringify(value) }),
              );
            });
          } catch (cause) {
            let error =
              cause instanceof Error ? cause : new Error(`unknown`, { cause });
            let { name, message } = error;
            yield* until(
              stream.push({
                event: "throw",
                data: JSON.stringify({ name, message }),
              }),
            );
          } finally {
            inflight.delete(task);
            yield* until(stream.close());
          }
        });
        inflight.add(task);

        return await stream.send();
      });
    }

    let server = serve(app, {
      port,
      silent: true,
    });

    yield* until(server.ready());

    try {
      yield* provide(`http://localhost:${port}`);
    } finally {
      while (inflight.size > 0) {
        for (let task of inflight) {
          yield* task.halt();
        }
      }
      yield* until(server.close());
    }
  });
}
