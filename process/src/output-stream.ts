import {
  createSignal,
  each,
  type Operation,
  resource,
  spawn,
  type Stream,
} from "effection";
import { Buffer } from "node:buffer";
import { map } from "@effectionx/stream-helpers";

export interface OutputStream extends Stream<Buffer, void> {
  text(): Stream<string, void>;
  lines(): Stream<string, void>;
}

export function createOutputStream(
  stream: Stream<Buffer, void>,
): OutputStream {
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
            for (const chunk of yield* each(stream)) {
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

