import type { Readable } from "node:stream";
import {
  Err,
  Ok,
  type Operation,
  type Result,
  type Stream,
  createSignal,
  resource,
} from "effection";

export type OutputStream = Stream<Uint8Array, void>;

export function useReadable(target: Readable | null): Stream<Uint8Array, void> {
  return resource(function* (provide) {
    let signal = createSignal<Uint8Array, void>();

    let listener = (chunk: Uint8Array) => {
      signal.send(chunk);
    };

    target?.on("data", listener);

    target?.on("end", signal.close);

    try {
      yield* provide(yield* signal);
    } finally {
      target?.off("data", listener);
      target?.off("end", signal.close);
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
  return (stream) => ({
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
            }
            let current = remainder + decoder.decode(next.value);
            let lines = current.split("\n");
            if (lines.length > 0) {
              buffer.push(...lines.slice(0, -1));
              remainder = lines.slice(-1)[0];
            } else {
              remainder = current;
            }
          }
          // biome-ignore lint/style/noNonNullAssertion: buffer.length > 0 guaranteed by while loop
          const value = buffer.pop()!;
          return {
            done: false,
            value,
          };
        },
      };
    },
  });
}

export function* box<T>(op: () => Operation<T>): Operation<Result<T>> {
  try {
    let value = yield* op();
    return Ok(value);
  } catch (e) {
    return Err(e as Error);
  }
}
