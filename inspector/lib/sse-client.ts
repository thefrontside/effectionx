import {
  createChannel,
  resource,
  spawn,
  stream,
  until,
  useAbortSignal,
} from "effection";
import {
  toJson,
  type Handle,
  type InvocationArgs,
  type InvocationResult,
  type Methods,
  type Protocol,
} from "../mod.ts";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import { type SSEMessage, SseStreamTransform } from "sse-stream-transform";
import { useLabels } from "../lib/labels.ts";
import { validateUnsafe } from "../lib/validate.ts";

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
        yield* useLabels({ name: `inspector.${methodName}()` });
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
        if (!response.body) {
          throw new TypeError(`${methodName}(): response contained no body`);
        }

        type TProgress = StandardSchemaV1.InferInput<M[N]["progress"]>;
        type TReturn = StandardSchemaV1.InferInput<M[N]["returns"]>;

        let channel = createChannel<TProgress, TReturn>();

        // TODO: why is the vite app not recognizing ReadableStream as AsyncIterable??
        let events = stream(
          response.body.pipeThrough(
            new SseStreamTransform(),
          ) as unknown as AsyncIterable<SSEMessage>,
        );

        yield* spawn(function* () {
          let subscription = yield* events;
          let next = yield* subscription.next();
          while (!next.done) {
            // validate the progress event from the server
            let { event, data } = next.value;
            let parsed = JSON.parse(data);
            if (event === "progress") {
              validateUnsafe(
                protocol.methods[name].progress,
                parsed,
                `progress ${methodName}()`,
              );
              yield* channel.send(parsed);
              next = yield* subscription.next();
            } else if (event === "return") {
              next = { done: true, value: parsed };
            }
          }

          // validate the return value
          validateUnsafe(
            protocol.methods[name].returns,
            next.value,
            `return value ${methodName}`,
          );
          yield* channel.close(next.value);
        });

        yield* provide(yield* channel);
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
