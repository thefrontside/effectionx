import { resource, spawn, stream, until } from "effection";
import type { Handle, InvocationArgs, InvocationResult, Methods, Protocol } from "../mod.ts";
import { createChannel, useAbortSignal } from "starfx";
import { StandardSchemaV1 } from "@standard-schema/spec";
import { type SSEMessage, SseStreamTransform } from "sse-stream-transform";
import { useLabels } from "../lib/labels.ts";

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
      // validate the arguments against the protocol
      validate(protocol.methods[name].args, args);

      let methodName = String(name);

      return resource(function*(provide) {
	yield* useLabels({ name: `inspector.${methodName}()`})
	let signal = yield* useAbortSignal();
	let response = yield* until(fetch(`/${methodName}`, {
	  signal,
	  headers: {
	    "Accept": "text/event-stream",
	  }
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
	  let subscription = yield* events;
	  let next = yield* subscription.next();
	  while (!next.value) {
	    // validate the progress event from the server
	    let { data } = next.value;
	    validate(protocol.methods[name].progress, JSON.parse(data));

	    yield* channel.send(data);
	    next = yield* subscription.next();
	  }

	  // validate the return value
	  validate(protocol.methods[name].returns, next.value);
	  yield* channel.close(next.value);
	});

	yield* provide(yield* channel);
      });
    },
    methods: Object.fromEntries(Object.keys(protocol.methods).map((name) => [name, (...args) => handle.invoke({ name, args })])) as Handle<M>["methods"],
  };

  return handle;
}

function validate<T>(schema: StandardSchemaV1<T>, value: unknown): asserts value is StandardSchemaV1.InferInput<StandardSchemaV1<T>> {
  let validation = schema["~standard"].validate(value);
  if (validation instanceof Promise) {
    throw new TypeError(`invalid protocol: async validations are not allowed`);
  }
  if (validation.issues) {
    throw new TypeError(validation.issues.join("\n"));
  }
}
