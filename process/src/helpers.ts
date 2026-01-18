import { Err, Ok, type Operation, type Result, type Stream } from "effection";

export type OutputStream = Stream<Uint8Array, void>;

export function* box<T>(op: () => Operation<T>): Operation<Result<T>> {
  try {
    const value = yield* op();
    return Ok(value);
  } catch (e) {
    return Err(e as Error);
  }
}
