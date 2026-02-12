import {
  once,
  type Operation,
  resource,
  scoped,
  spawn,
  type Task,
  until,
  useAttributes,
  useScope,
} from "effection";
import type { Handle, Methods } from "./types.ts";
import { validateUnsafe } from "./validate.ts";

import {
  createEventStream,
  defineEventHandler,
  H3,
  serve,
  serveStatic,
} from "h3";
import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";

export interface SSEServerOptions {
  port: number;
}

export function useSSEServer<M extends Methods>(
  handle: Handle<M>,
  options: SSEServerOptions,
): Operation<string> {
  let { port } = options;
  let { protocol } = handle;
  let methodNames = Object.keys(protocol.methods) as Array<keyof M>;

  return resource(function* (provide) {
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
            yield* spawn(() =>
              scoped(function* () {
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
              }),
            );
            yield* once(req.signal, "abort");
          } catch (cause) {
            let error =
              cause instanceof Error ? cause : new Error("unknown", { cause });
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

    const ROOT_DIR = join(import.meta.dirname, "..");
    const PUBLIC_DIR = join(
      ...(ROOT_DIR === "dist"
        ? [ROOT_DIR, "..", "crank", "dist"]
        : [ROOT_DIR, "crank", "dist"]),
    );

    const frontendRoutes = ["/live", "/recording", "/demo"];
    // handle static assets from the crank dist directory (js, css, etc.)
    app.use(
      defineEventHandler(async (event) => {
        return await serveStatic(event, {
          getContents: (id) => {
            const filename = frontendRoutes.includes(id) ? "index.html" : id;
            return readFile(join(PUBLIC_DIR, filename));
          },
          getMeta: async (id) => {
            const filename = frontendRoutes.includes(id) ? "index.html" : id;
            const stats = await stat(join(PUBLIC_DIR, filename)).catch(
              () => null,
            );
            if (!stats || !stats.isFile()) return;
            return { size: stats.size, mtime: stats.mtime };
          },
          fallthrough: true,
        });
      }),
    );

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
