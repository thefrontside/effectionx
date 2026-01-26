import { Err, Ok, Operation, type Result } from "effection";

export function* box<T>(op: () => Operation<T>): Operation<Result<T>> {
  try {
    return Ok(yield* op());
  } catch (error) {
    return Err(error as Error);
  }
}
