import { Err, Ok, type Operation, type Result } from "effection";

export function* box<T>(content: () => Operation<T>): Operation<Result<T>> {
  try {
    return Ok(yield* content());
  } catch (error) {
    return Err(error as Error);
  }
}

export function unbox<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}
