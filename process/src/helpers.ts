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
    const signal = createSignal<Uint8Array, void>();

    const listener = (chunk: Uint8Array) => {
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

export function* box<T>(op: () => Operation<T>): Operation<Result<T>> {
  try {
    const value = yield* op();
    return Ok(value);
  } catch (e) {
    return Err(e as Error);
  }
}
