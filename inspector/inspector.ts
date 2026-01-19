import {
  action,
  call,
  each,
  Err,
  global,
  Ok,
  type Operation,
  resource,
  scoped,
  spawn,
  type Stream,
  type Subscription,
  until,
  useScope,
  withResolvers,
} from "effection";
import { api } from "effection/experimental";
import type EventEmitter from "node:events";
import { createServer } from "node:http2";
import * as inspectors from "./task/mod.ts";

global.decorate(api.Main, {
  main([body], next) {
    return next(function* (args) {
      const inspector = yield* inspectors.scope.attach();

      let taskOps = createStreamableSubscription(
        yield* inspector.methods.watchTasks(),
      );

      yield* spawn(function* () {
        for (let event of yield* each(taskOps)) {
          console.log(event);
          yield* each.next();
        }
      });

      let connected = withResolvers<void>();

      let port = yield* resource(function* (provide) {
        let scope = yield* useScope();
        const server = createServer((req, res) => {
          connected.resolve();
          res.end(); // scope.run(function* () {
          //   try {
          //     yield* scoped(function* () {
          //       res.writeHead(200, {
          //         "Content-Type": "text/event-stream; charset=utf-8",
          //         "Cache-Control": "no-cache",
          //         "Connection": "keep-alive",
          //         "X-Accel-Buffering": "no",
          //       });

          //       yield* spawn(function* () {
          //         for (let event of yield* each(taskOps)) {
          //           res.write(`\n\n`);
          //           res.write(`event: ${event.type}\n`);
          //           res.write(`data: ${JSON.stringify(event)}\n`);
          //           yield* each.next();
          //         }
          //       });

          //       yield* onceEmit(req, "closed");
          //     });
          //   } catch (error) {
          //     console.error(error);
          //   }
          // })

          //const url = new URL(req.url ?? "", `http://127.0.0.1`);

          //     const pathname = url.pathname;

          //     // GET /data -> whole object
          //     if (
          //       req.method === "GET" &&
          //       (pathname === "/data" || pathname === "/")
          //     ) {
          //       const body = JSON.stringify(data || {});
          //       res.writeHead(200, {
          //         "content-type": "application/json",
          //         "content-length": String(Buffer.byteLength(body)),
          //       });
          //       res.end(body);
          //       return;
          //     }

          //     // GET /data/<key> -> value or 404
          //     if (req.method === "GET" && pathname.startsWith("/data/")) {
          //       const key = decodeURIComponent(pathname.replace(/^\/data\//, ""));
          //       if (!key) {
          //         res.writeHead(400);
          //         res.end();
          //         return;
          //       }

          //       const value = (data as Record<string, unknown> | undefined)
          //         ?.[key];
          //       if (value === undefined) {
          //         res.writeHead(404, { "content-type": "text/plain" });
          //         res.end("not found");
          //         return;
          //       }

          //       const body = JSON.stringify(value);
          //       res.writeHead(200, {
          //         "content-type": "application/json",
          //         "content-length": String(Buffer.byteLength(body)),
          //       });
          //       res.end(body);
          //       return;
          //     }

          //     // unknown endpoint
          //     res.writeHead(404, { "content-type": "text/plain" });
          //     res.end("not found");
          //   } catch (err) {
          //     res.writeHead(500, { "content-type": "text/plain" });
          //     res.end(String(err));
          //   }
          // });

          // // listen on ephemeral port bound to localhost
          // yield* call(() => server.listen());

          // const address = server.address();
          // const port =
          //   typeof address === "object" && address !== null && "port" in address
          //     ? address.port
          //     : 0;

          // yield* stdout(`data service: started on port ${port}`);

          // try {
          //   yield* provide({ port });
          // } finally {
          //   yield* call(() => server.close());
          //   yield* stdout(`data service: stopped on port ${port}`);
          // }
        });

        try {
          // listen on ephemeral port bound to localhost
          yield* action<void>((resolve) => {
            server.listen(void (0), resolve);
            return () => {};
          });

          const address = server.address();
          const port =
            typeof address === "object" && address !== null && "port" in address
              ? address.port
              : 0;

          yield* provide(port);
        } finally {
          yield* call(() => server.close());
        }
      });

      console.log(`inspector started on ${port}, waiting for connection`);
      yield* connected.operation;

      yield* body(args);
    });
  },
});

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

function createStreamableSubscription<T, TClose>(
  subscription: Subscription<T, TClose>,
): Stream<T, TClose> {
  return {
    *[Symbol.iterator]() {
      return subscription;
    },
  };
}
