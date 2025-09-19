import {
  createSignal,
  type Operation,
  resource,
  spawn,
  type Stream,
} from "effection";
import type { Buffer } from "node:buffer";
import type { Readable } from "node:stream";
import { forEach, map } from "@effectionx/stream-helpers";
import { on, once } from "./eventemitter.ts";
import { createArraySignal } from "../../signals/array.ts";

export interface OutputStream extends Stream<Buffer, void> {
  text(): Stream<string, void>;
  lines(): Stream<string, void>;
}

export function useOutputStream(
  target: Readable | undefined,
  event: string,
): Operation<OutputStream> {
  return resource(function* (provide) {
    const signal = createSignal<Buffer<ArrayBufferLike>, void>();

    let chunks: Stream<Buffer<ArrayBufferLike>, never> | undefined;
    if (target) {
      yield* spawn(function* () {
        yield* once(target, "end");
        signal.close();
      });

      chunks = map<
        [Buffer<ArrayBufferLike>],
        Buffer<ArrayBufferLike>
      >(function* ([chunk]) {
        return chunk;
      })(on<[Buffer<ArrayBufferLike>]>(target, event));
    }

    if (chunks) {
      yield* spawn(() =>
        forEach(function* (chunk) {
          signal.send(chunk);
        }, chunks)
      );
    }

    try {
      yield* provide({
        [Symbol.iterator]: signal[Symbol.iterator],
        text() {
          return map(function* (chunk) {
            console.log(`output-stream > text > map: ${String(chunk)}`);
            return String(chunk);
          })(signal);
        },
        lines() {
          return {
            *[Symbol.iterator]() {
              const buffer = yield* createArraySignal<
                IteratorResult<string, void>
              >([]);

              yield* spawn(function* () {
                let current = "";

                if (chunks) {
                  yield* forEach(function* (chunk) {
                    console.log(`stream: got chunk ${chunk}`);
                    let lines = (current + chunk.toString()).split("\n");
                    lines.slice(0, -1).forEach((value) =>
                      buffer.push({ value, done: false })
                    );
                    current = lines.slice(-1)[0];
                  }, chunks);
                }

                if (current) {
                  buffer.push({
                    done: false,
                    value: current,
                  });
                }
                buffer.push({
                  done: true,
                  value: undefined,
                });
              });

              return {
                next() {
                  return buffer.shift();
                },
              };
            },
          };
        },
      });
    } finally {
      signal.close();
    }
  });
}
