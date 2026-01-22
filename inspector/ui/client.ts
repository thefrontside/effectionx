import { resource, spawn, stream, until } from "effection";
import { toJson, type Handle, type InvocationArgs, type InvocationResult, type Methods, type Protocol } from "../mod.ts";
import { createChannel, useAbortSignal } from "starfx";
import { StandardSchemaV1 } from "@standard-schema/spec";
import { type SSEMessage, SseStreamTransform } from "sse-stream-transform";
import { useLabels } from "../lib/labels.ts";
import { validateUnsafe } from "../lib/validate.ts";

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
export function createSSEClient<M extends Methods>(protocol: Protocol<M>): Handle<M> {
  let handle: Handle<M> = {
    protocol,
    invoke<N extends keyof M>({ name, args }: InvocationArgs<M, N>): InvocationResult<M, N> {

      console.log('invoke', { name, args });
      // validate the arguments against the protocol
      validateUnsafe(protocol.methods[name].args, args);

      let methodName = String(name);

      return resource(function*(provide) {
	yield* useLabels({ name: `inspector.${methodName}()`})
	let signal = yield* useAbortSignal();
	let response = yield* until(fetch(`/${methodName}`, {
	  signal,
	  method: "POST",
	  headers: {
	    "Accept": "text/event-stream",
	  },
	  body: JSON.stringify(toJson(args)),
	}));
	if (!response.body) {
	  throw new TypeError(`${methodName}(): response contained no body`)
	}

	type TProgress = StandardSchemaV1.InferInput<M[N]["progress"]>;
	type TReturn = StandardSchemaV1.InferInput<M[N]["returns"]>

	let channel = createChannel<TProgress, TReturn>();

	// TODO: why is the vite app not recognizing ReadableStream as AsyncIterable??
	let events = stream(response.body.pipeThrough(new SseStreamTransform()) as unknown as AsyncIterable<SSEMessage>);

	yield* spawn(function*() {
	  console.log('subscribing to events');
	  console.log(response);
	  let subscription = yield* events;
	  console.log('subscribed to events')
	  let next = yield* subscription.next();
	  console.log({ next });
	  while (!next.value) {
	    // validate the progress event from the server
	    let { event, data } = next.value;
	    if ( event === "progress") {

	      validateUnsafe(protocol.methods[name].progress, JSON.parse(data));
	      yield* channel.send(data);
	      next = yield* subscription.next();
	      console.log({ next });
	      continue;
	    } else if (event === "return") {

	      validateUnsafe(protocol.methods[name].returns, JSON.parse(data));
	      yield* channel.close(data);
	      break;
	    }
	  }

	  // validate the return value
	  validateUnsafe(protocol.methods[name].returns, next.value);
	  yield* channel.close(next.value);
	});

	yield* provide(yield* channel);
      });
    },
    methods: Object.fromEntries(Object.keys(protocol.methods).map((name) => [name, (...args) => handle.invoke({ name, args })])) as Handle<M>["methods"],
  };

  return handle;
}
