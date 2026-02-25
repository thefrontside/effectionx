import { resource, spawn, each, createSignal, until } from "effection";
import type { Operation } from "effection";
import {
  DurableStream as RemoteStream,
  FetchError,
} from "@durable-streams/client";
import type { DurableEvent, StreamEntry } from "./types.ts";
import { HttpDurableStream } from "./http-durable-stream.ts";

export { HttpDurableStream } from "./http-durable-stream.ts";

/**
 * An Effection resource that connects to a remote
 * [Durable Streams](https://github.com/durable-streams/durable-streams) server
 * and provides an {@link HttpDurableStream} implementing the
 * {@link import("./types.ts").DurableStream} interface.
 *
 * On creation:
 * 1. Connects to the remote stream (or creates it if it doesn't exist)
 * 2. Pre-fetches existing events for replay
 * 3. Creates an {@link HttpDurableStream} that buffers locally and
 *    replicates to the server via an `IdempotentProducer`
 * 4. Surfaces producer errors into structured concurrency — if the
 *    producer can't write to the server, the enclosing scope fails
 *
 * On cleanup (when the enclosing scope exits):
 * - Flushes all pending writes to the server
 * - Detaches the producer
 * - Does NOT delete the remote stream — it stays open for future resume
 *
 * @example
 * ```ts
 * import { main } from "effection";
 * import { durably } from "@effectionx/durably";
 * import { useDurableStream } from "@effectionx/durably/http";
 *
 * await main(function* () {
 *   let stream = yield* useDurableStream("http://localhost:4437/my-workflow");
 *
 *   yield* durably(function* () {
 *     yield* sleep(1000);
 *     return "hello";
 *   }, { stream });
 * });
 * ```
 */
export function useDurableStream(url: string): Operation<HttpDurableStream> {
  return resource(function* (provide) {
    // Connect to existing stream or create a new one
    let remote = yield* connectOrCreate(url);

    // Pre-fetch existing events for replay
    let res = yield* until(
      remote.stream<DurableEvent>({ json: true, live: false }),
    );
    let items = yield* until(res.json<DurableEvent>());
    let entries: StreamEntry[] = items.map((event, i) => ({
      offset: i,
      event,
    }));

    // Create the adapter
    let stream = new HttpDurableStream(remote, entries);

    // Surface producer errors into structured concurrency —
    // if the producer can't write to the server, the workflow should fail
    let errors = createSignal<Error>();
    stream.errorHandler = errors.send;

    yield* spawn(function* () {
      for (let error of yield* each(errors)) {
        throw error;
        yield* each.next();
      }
    });

    try {
      yield* provide(stream);
    } finally {
      // Flush pending writes, then detach producer.
      // Does NOT close the remote stream — it stays open for resume.
      yield* until(stream.flushAndDetach());
    }
  });
}

function* connectOrCreate(url: string): Operation<RemoteStream> {
  try {
    return yield* until(
      RemoteStream.connect({
        url,
        contentType: "application/json",
      }),
    );
  } catch (e: unknown) {
    if (e instanceof FetchError && (e as FetchError).status === 404) {
      return yield* until(
        RemoteStream.create({
          url,
          contentType: "application/json",
        }),
      );
    }
    throw e;
  }
}
