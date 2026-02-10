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
import { readFile, stat } from "fs/promises";
import { join } from "path";

export interface SSEServerOptions {
  port: number;
}

const handleStaticRoutes = () => {
  const app = new H3();

  const ROOT_DIR = join(import.meta.dirname, "..");
  const PUBLIC_DIR = join(
    ...(ROOT_DIR === "dist"
      ? [ROOT_DIR, "..", "crank", "dist"]
      : [ROOT_DIR, "crank", "dist"]),
  );

  // handle static assets from the crank dist directory (js, css, etc.)
  app.use(
    defineEventHandler(async (event) => {
      return await serveStatic(event, {
        getContents: (id) => readFile(join(PUBLIC_DIR, id)),
        getMeta: async (id) => {
          const stats = await stat(join(PUBLIC_DIR, id)).catch(() => null);
          if (!stats || !stats.isFile()) return;
          return { size: stats.size, mtime: stats.mtime };
        },
        // assumed missed routes are likely SPA routes and handled below
        fallthrough: true,
      });
    }),
  );

  // catch-all route to serve the index.html for any non-asset requests
  // e.g. /live, /demo, etc. so client-side routing works
  app.use(
    "/*",
    defineEventHandler(async (event) => {
      return await serveStatic(event, {
        getContents: () => readFile(join(PUBLIC_DIR, "index.html")),
        getMeta: async () => {
          const stats = await stat(join(PUBLIC_DIR, "index.html")).catch(
            () => null,
          );
          if (!stats || !stats.isFile()) return;
          return { size: stats.size, mtime: stats.mtime };
        },
      });
    }),
  );

  return app;
};

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

    const staticAssets = handleStaticRoutes();
    let server = serve(app.mount("/", staticAssets), {
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
