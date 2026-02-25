import { IdempotentProducer } from "@durable-streams/client";
import type { DurableStream as RemoteStream } from "@durable-streams/client";
import type { DurableStream, DurableEvent, StreamEntry } from "./types.ts";

/**
 * A {@link DurableStream} backed by a remote
 * [Durable Streams](https://github.com/durable-streams/durable-streams) server.
 *
 * Buffers events locally for synchronous reads while asynchronously
 * replicating each append to the remote stream via an
 * {@link IdempotentProducer}. Pre-populated with existing events
 * fetched from the remote stream on construction, enabling replay.
 */
export class HttpDurableStream implements DurableStream {
  private buffer: StreamEntry[];
  private _closed = false;
  readonly producer: IdempotentProducer;

  errorHandler?: (err: Error) => void;

  constructor(remote: RemoteStream, initialEntries: StreamEntry[]) {
    this.buffer = [...initialEntries];
    this.producer = new IdempotentProducer(
      remote,
      `durable-effection-${crypto.randomUUID()}`,
      {
        autoClaim: true,
        onError: (err: Error) => this.errorHandler?.(err),
      },
    );
  }

  get length() {
    return this.buffer.length;
  }

  get closed() {
    return this._closed;
  }

  append(event: DurableEvent): number {
    if (this._closed) throw new Error("Cannot append to closed stream");
    let offset = this.buffer.length;
    this.buffer.push({ offset, event });
    this.producer.append(JSON.stringify(event));
    return offset;
  }

  read(fromOffset = 0): StreamEntry[] {
    return this.buffer.slice(fromOffset);
  }

  close(): void {
    this._closed = true;
  }

  async flushAndDetach(): Promise<void> {
    this._closed = true;
    await this.producer.flush();
    await this.producer.detach();
  }
}
