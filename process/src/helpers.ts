import {
  createSignal,
  Err,
  Ok,
  type Operation,
  resource,
  type Result,
  type Stream,
} from "effection";
import type { Readable } from "node:stream";

export type OutputStream = Stream<Uint8Array, void>;

export function useReadable(
  target: Readable,
): Stream<Uint8Array, void> {
  return resource(function* (provide) {
    let signal = createSignal<Uint8Array, void>();

    let listener = (chunk: Uint8Array) => {
      console.log(`process>helpers>listener: ${chunk}`);
      signal.send(chunk);
    };

    target.on("data", listener);

    target.on("end", signal.close);

    try {
      yield* provide(yield* signal);
    } finally {
      target.off("data", listener);
      target.off("end", signal.close);
      signal.close();
    }
  });
}

interface Remainder<T> {
  remainder: string;
  result: T;
}

export function lines(): <T extends Uint8Array, TReturn>(
  stream: Stream<T, TReturn>,
) => Stream<string, Remainder<TReturn>> {
  const decoder = new TextDecoder();
  return function (stream) {
    return {
      *[Symbol.iterator]() {
        let subscription = yield* stream;
        let buffer: string[] = [];
        let remainder = "";

        return {
          *next() {
            while (buffer.length === 0) {
              let next = yield* subscription.next();
              if (next.done) {
                return {
                  done: true,
                  value: {
                    remainder,
                    result: next.value,
                  },
                };
              } else {
                let current = remainder + decoder.decode(next.value);
                let lines = current.split("\n");
                if (lines.length > 0) {
                  buffer.push(...lines.slice(0, -1));
                  remainder = lines.slice(-1)[0];
                } else {
                  remainder = current;
                }
              }
            }
            return {
              done: false,
              value: buffer.pop()!,
            };
          },
        };
      },
    };
  };
}

export function* box<T>(op: () => Operation<T>): Operation<Result<T>> {
  try {
    let value = yield* op();
    return Ok(value);
  } catch (e) {
    return Err(e as Error);
  }
}
