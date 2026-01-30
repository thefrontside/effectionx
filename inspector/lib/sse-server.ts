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
