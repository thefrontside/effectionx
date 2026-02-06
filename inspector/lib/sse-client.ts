import {
  resource,
  stream,
  until,
  useAbortSignal,
  useAttributes,
} from "effection";
import {
  toJson,
  type Handle,
  type InvocationArgs,
  type InvocationResult,
  type Methods,
  type Protocol,
} from "../mod.ts";
import { validateUnsafe } from "../lib/validate.ts";
import { parseServerSentEvents } from "parse-sse";

export interface SSEClientOptions {
  url?: string;
}

/**
 * Implement a protocol by calling it over SSE. if the protocl has a method `.foo()`, it
 * will use the SSE stream at `/foo`
 *
 * The arguments of the protocl are validated before they are sent, and the returned values are
 * validated on the way back.
 *
 * @param protocol - the protocol to implement
 * @returns a handle to a protocol implementation that will invoke its methods over the wire.
 */
export function createSSEClient<M extends Methods>(
  protocol: Protocol<M>,
  options: SSEClientOptions = {},
): Handle<M> {
  let handle: Handle<M> = {
    protocol,
    invoke<N extends keyof M>({
      name,
      args,
    }: InvocationArgs<M, N>): InvocationResult<M, N> {
      let methodName = String(name);

      // validate the arguments against the protocol
      validateUnsafe(
        protocol.methods[name].args,
        args,
        `arguments ${methodName}()`,
      );

      return resource(function* (provide) {
        yield* useAttributes({ name: `inspector.${methodName}()` });
        let signal = yield* useAbortSignal();

        let pathname = `/${methodName}`;

        let url = options.url ? new URL(pathname, options.url) : pathname;

        let response = yield* until(
          fetch(url, {
            signal,
            method: "POST",
            headers: {
              Accept: "text/event-stream",
            },
            body: JSON.stringify(toJson(args)),
          }),
        );

        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }

        let events = stream(parseServerSentEvents(response));

        let subscription = yield* events;

        yield* provide({
          *next() {
            let next = yield* subscription.next();
            if (next.done) {
              throw new Error(`connection closed`);
            }

            let { type, data } = next.value;
            let parsed = JSON.parse(data);
            if (type === "yield") {
              return {
                done: false,
                value: validateUnsafe(
                  protocol.methods[name].progress,
                  parsed,
                  `progress ${methodName}()`,
                ),
              };
            } else if (type === "return") {
              return {
                done: true,
                value: validateUnsafe(
                  protocol.methods[methodName].returns,
                  parsed,
                ),
              };
            } else if (type === "throw") {
              throw parsed;
            } else {
              throw new TypeError(`unrecognized event type: '${type}'`);
            }
          },
        });
      });
    },
    methods: Object.fromEntries(
      Object.keys(protocol.methods).map((name) => [
        name,
        (...args) => handle.invoke({ name, args }),
      ]),
    ) as Handle<M>["methods"],
  };

  return handle;
}
