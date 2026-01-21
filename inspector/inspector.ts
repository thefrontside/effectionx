import {
  action,
  call,
  each,
  global,
  type Operation,
  resource,
  scoped,
  spawn,
  type Stream,
  type Subscription,
  useScope,
  withResolvers,
} from "effection";
import { api } from "effection/experimental";
import type EventEmitter from "node:events";
import { createServer } from "node:http";
import * as inspectors from "./scope/mod.ts";

global.decorate(api.Main, {
  main([body], next) {
    return next(function* (args) {
      const inspector = yield* inspectors.scope.attach();

      let taskOps = createStreamableSubscription(
        yield* inspector.methods.watchScopes(),
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
        const server = createServer(async (req, res) => {
          connected.resolve();

          await scope.run(function* () {
            try {
              yield* scoped(function* () {
                res.writeHead(200, {
                  "Content-Type": "text/event-stream; charset=utf-8",
                  "Cache-Control": "no-cache",
                  Connection: "keep-alive",
                  "X-Accel-Buffering": "no",
                });

                // send headers immediately to establish SSE with client
                res.flushHeaders();

                yield* spawn(function* () {
                  for (let event of yield* each(taskOps)) {
                    res.write(`event: ${event.type}\n`);
                    res.write(`data: ${JSON.stringify(event)}\n\n`);
                    yield* each.next();
                  }
                });

                // wait for the response to be closed by the client
                yield* onceEmit(res, "close");
              });
            } catch (error) {
              console.error(error);
            } finally {
              res.end();
            }
          });
        });

        try {
          // listen on ephemeral port bound to localhost
          yield* action<void>((resolve) => {
            server.listen(41000, resolve);
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
