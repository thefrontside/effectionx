import {
  action,
  createSignal,
  each,
  type Operation,
  race,
  resource,
  scoped,
  spawn,
  type Stream,
  useScope,
  withResolvers,
} from "effection";
import type { Handle, Methods } from "./types.ts";
import { createServer } from "node:http";
import { createReadStream, promises as fsPromises } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import type { AddressInfo } from "node:net";
import type EventEmitter from "node:events";
import type { Readable } from "node:stream";
import { validate } from "./validate.ts";
import { useLabels } from "./labels.ts";

export interface SSEServerOptions {
  port: number;
}

export function useSSEServer<M extends Methods>(
  handle: Handle<M>,
  options: SSEServerOptions,
): Operation<AddressInfo> {
  let { protocol } = handle;
  let methodNames = Object.keys(protocol.methods) as Array<keyof M>;
  const uiDist = path.join(
    path.dirname(fileURLToPath(import.meta.url)),
    "..",
    "ui",
    "dist",
  );

  return resource(function* (provide) {
    yield* useLabels({ name: "SSEServer", port: options.port });
    let scope = yield* useScope();
    const server = createServer(async (req, res) => {
      if (!req.url) {
        return;
      }

      let url = req.url.startsWith("http")
        ? new URL(req.url)
        : new URL(`http://localhost${req.url}`);

      let name = methodNames.find(
        (name) => url.pathname === `/${String(name)}`,
      );

      await scope.run(function* () {
        yield* useLabels({
          name: "RequestHandler",
          url: req.url ?? "UKNOWN",
          method: req.method ?? "UKNOWN",
        });
        if (!name) {
          // Attempt to serve static UI (SPA) from inspector/ui/dist when no RPC method matches.
          if (req.method === "GET" || req.method === "HEAD") {
            try {
              // map "/" to index.html for SPA
              let pathname =
                url.pathname === "/"
                  ? "/index.html"
                  : decodeURIComponent(url.pathname);
              // prevent path traversal
              let relPath = pathname.replace(/^\/+/, "");
              let filePath = path.join(uiDist, relPath);

              // avoid default file viewing outside of ui/dist
              if (!filePath.startsWith(uiDist)) {
                res.statusCode = 403;
                res.statusMessage = "Forbidden";
                res.end();
                return;
              }

              try {
                let stat = yield* action<import("node:fs").Stats>(
                  (resolve, reject) => {
                    fsPromises.stat(filePath).then(resolve).catch(reject);
                    return () => {};
                  },
                );
                if (stat.isDirectory()) {
                  filePath = path.join(filePath, "index.html");
                  stat = yield* action<import("node:fs").Stats>(
                    (resolve, reject) => {
                      fsPromises.stat(filePath).then(resolve).catch(reject);
                      return () => {};
                    },
                  );
                }

                // set headers
                let ext = path.extname(filePath).toLowerCase();
                let contentType = getContentType(ext);
                let headers: Record<string, string> = {
                  "Content-Type": contentType,
                  "Cache-Control":
                    ext === ".html" ? "no-cache" : "public, max-age=31536000",
                };

                res.writeHead(200, headers);
                if (req.method === "HEAD") {
                  res.end();
                  return;
                }
                createReadStream(filePath).pipe(res);
                return;
              } catch (err) {
                // if file not found and path looks like a SPA route (no extension),
                // serve index.html as a fallback so client-side routing works.
                if (!path.extname(relPath)) {
                  let indexPath = path.join(uiDist, "index.html");
                  try {
                    yield* action<void>((resolve, reject) => {
                      fsPromises
                        .access(indexPath)
                        .then(() => resolve())
                        .catch(reject);
                      return () => {};
                    });
                    res.writeHead(200, {
                      "Content-Type": "text/html; charset=utf-8",
                      "Cache-Control": "no-cache",
                    });
                    createReadStream(indexPath).pipe(res);
                    return;
                  } catch {
                    // fall through to 404
                  }
                }
                // fall through to 404
              }
            } catch {
              // any error -> fall through to 404
            }
          }

          res.statusCode = 404;
          res.statusMessage = "Not Found";
          res.end();
          return;
        }

        try {
          yield* scoped(function* () {
            yield* useLabels({ name: "Transport" });
            let args =
              req.method?.toUpperCase() === "POST"
                ? JSON.parse(yield* read(req))
                : [];
            let result = validate(protocol.methods[name].args, args);

            if (!result.ok) {
              res.statusCode = 400;
              res.statusMessage = "Invalid Arguments";
              let { name, message } = result.error;
              res.write(JSON.stringify({ name, message }, null, 2));
              return;
            }

            res.writeHead(200, {
              "Content-Type": "text/event-stream; charset=utf-8",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
              "X-Accel-Buffering": "no",
            });

            // send headers immediately to establish SSE with client
            res.flushHeaders();

            let subscription = yield* handle.invoke({ name, args });
            let { resolve: resolveDone, operation: done } =
              withResolvers<void>();

            yield* spawn(function* () {
              yield* useLabels({ name: "streamEvents" });
              let next = yield* subscription.next();

              while (!next.done) {
                res.write("event: progress\n");
                res.write(`data: ${JSON.stringify(next.value)}\n\n`);
                next = yield* subscription.next();
              }
              res.write("event: return\n");
              res.write(`data: ${JSON.stringify(next.value ?? null)}\n\n`);

              resolveDone();
            });

            yield* race([onceEmit(res, "close"), done]);
          });
        } finally {
          res.write("event: return\n");
          res.write(`data: ${null}\n\n`);
          res.end();
        }
      });
    });

    yield* action<void>((resolve) => {
      server.listen(options.port, resolve);
      return () => {};
    });

    try {
      yield* provide(server.address() as AddressInfo);
    } finally {
      yield* action<void>((resolve, reject) => {
        server.close((err) => {
          err ? reject(err) : resolve();
        });
        return () => {};
      });
    }
  });
}

function onceEmit<TArgs extends unknown[]>(
  emitter: EventEmitter,
  eventName: string,
): Operation<TArgs> {
  return action((resolve) => {
    let listener = (...args: TArgs) => resolve(args);
    emitter.once(eventName, listener);
    return () => emitter.off(eventName, listener);
  });
}

function onEmit<TArgs extends unknown[]>(
  emitter: EventEmitter,
  eventName: string,
): Stream<TArgs, never> {
  return resource(function* (provide) {
    let signal = createSignal<TArgs, never>();
    let listener = (...args: TArgs) => signal.send(args);

    emitter.on(eventName, listener);

    try {
      yield* provide(yield* signal);
    } finally {
      emitter.off(eventName, listener);
    }
  });
}

function read(readable: Readable): Operation<string> {
  return scoped(function* () {
    let buffer = "";
    yield* spawn(function* () {
      for (let chunk of yield* each(onEmit(readable, "data"))) {
        buffer += chunk ? String(chunk) : "";
        yield* each.next();
      }
    });
    yield* onceEmit(readable, "end");
    return buffer;
  });
}

function getContentType(ext: string): string {
  switch (ext) {
    case ".html":
      return "text/html; charset=utf-8";
    case ".js":
    case ".mjs":
      return "application/javascript; charset=utf-8";
    case ".css":
      return "text/css; charset=utf-8";
    case ".json":
      return "application/json; charset=utf-8";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".svg":
      return "image/svg+xml";
    case ".ico":
      return "image/x-icon";
    case ".wasm":
      return "application/wasm";
    case ".map":
      return "application/json; charset=utf-8";
    default:
      return "application/octet-stream";
  }
}
