import { createSignal, spawn, type Stream } from "effection";
import type { Buffer } from "node:buffer";
import type { Readable } from "node:stream";
import { forEach, map } from "@effectionx/stream-helpers";
import { on, once } from "./eventemitter.ts";

export interface OutputStream extends Stream<Buffer, void> {
  text(): Stream<string, void>;
  lines(): Stream<string, void>;
}

export function createOutputStream(
  target: Readable,
  event: string,
): OutputStream {
  const events = on<[Buffer<ArrayBufferLike>]>(target, event);

  const individualChunk = map<
    [Buffer<ArrayBufferLike>],
    Buffer<ArrayBufferLike>
  >(function* ([chunk]) {
    return chunk;
  })(events);

  return {
    *[Symbol.iterator]() {
      const signal = createSignal<Buffer<ArrayBufferLike>, void>();
      const subscrition = yield* signal;

      yield* spawn(function* () {
        yield* once(target, "end");
        signal.close();
      });

      yield* spawn(() =>
        forEach(function* (chunk) {
          signal.send(chunk);
        }, individualChunk)
      );

      return subscrition;
    },
    text() {
      return {
        *[Symbol.iterator]() {
          const signal = createSignal<string, void>();
          const subscrition = yield* signal;

          yield* spawn(function* () {
            yield* once(target, "end");
            signal.close();
          });

          yield* spawn(() =>
            forEach(function* (chunk) {
              signal.send(String(chunk));
            }, individualChunk)
          );

          return subscrition;
        },
      };
    },
    lines() {
      return {
        *[Symbol.iterator]() {
          const signal = createSignal<string, void>();
          const subscrition = yield* signal;

          yield* spawn(function* () {
            yield* once(target, "end");
            signal.close();
          });

          yield* spawn(function* () {
            let current = "";

            yield* forEach(function* (chunk) {
              console.log(`stream: got chunk ${chunk}`);
              let lines = (current + chunk.toString()).split("\n");
              lines.slice(0, -1).forEach(signal.send);
              current = lines.slice(-1)[0];
            }, individualChunk);

            if (current) {
              signal.send(current);
            }
          });

          return subscrition;
        },
      };
    },
  };
}
