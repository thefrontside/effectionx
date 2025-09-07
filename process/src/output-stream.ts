import {
  createSignal,
  each,
  type Operation,
  resource,
  spawn,
  type Stream,
} from "effection";
import type { Buffer } from "node:buffer";
import { map } from "@effectionx/stream-helpers";
import type { EventEmitter } from "node:stream";
import { forEach } from "./for-each.ts";
import { on } from "./eventemitter.ts";

export interface OutputStream extends Stream<Buffer, void> {
  text(): Stream<string, void>;
  lines(): Stream<string, void>;
}

export function createOutputStream(stream: Stream<Buffer, void>): OutputStream {
  return {
    [Symbol.iterator]: stream[Symbol.iterator],
    text() {
      return map<Buffer, string>(function* (c) {
        return c.toString();
      })(stream);
    },
    lines() {
      return {
        *[Symbol.iterator]() {
          const linesOutput = createSignal<string, void>();

          yield* spawn(function* () {
            let current = "";
            console.log("started lines loop")
            for (const chunk of yield* each(stream)) {
              console.log("in lines got", chunk)
              let lines = (current + chunk.toString()).split("\n");
              lines.slice(0, -1).forEach(linesOutput.send);
              current = lines.slice(-1)[0];
              yield* each.next();
            }
            if (current) {
              linesOutput.send(current);
            }
            linesOutput.close();
          });

          return yield* linesOutput;
        },
      };
    },
  };
}

export function createOutputStreamFromEventEmitter(
  eventEmitter: EventEmitter,
  event: string,
): Operation<OutputStream> {
  return resource(function* (provide) {
    let signal = createSignal<Buffer<ArrayBufferLike>, void>();

    if (eventEmitter) {
      yield* spawn(
        forEach(function* (chunk) { signal.send(chunk); }, on<Buffer<ArrayBufferLike>>(eventEmitter, event)),
      );
    }
    
    try {
      yield* provide(createOutputStream(signal));
    } finally {
      signal.close();
    }
  });
}
