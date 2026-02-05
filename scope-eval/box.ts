import { Err, Ok, type Operation, type Result } from "effection";

/**
 * Execute an operation and capture its result (success or error) as a `Result<T>`.
 *
 * This is useful when you want to handle errors as values rather than exceptions.
 *
 * @param content - A function returning the operation to execute
 * @returns An operation that yields `Ok(value)` on success or `Err(error)` on failure
 *
 * @example
 * ```ts
 * const result = yield* box(function*() {
 *   return yield* someOperation();
 * });
 *
 * if (result.ok) {
 *   console.log("Success:", result.value);
 * } else {
 *   console.log("Error:", result.error);
 * }
 * ```
 */
export function box<T>(content: () => Operation<T>): Operation<Result<T>> {
  return {
    *[Symbol.iterator]() {
      try {
        return Ok(yield* content());
      } catch (error) {
        return Err(error as Error);
      }
    },
  };
}

/**
 * Extract the value from a `Result<T>`, throwing if it's an error.
 *
 * @param result - The result to unbox
 * @returns The success value
 * @throws The error if the result is an `Err`
 *
 * @example
 * ```ts
 * const result = yield* box(function*() {
 *   return "hello";
 * });
 *
 * const value = unbox(result); // "hello"
 * ```
 */
export function unbox<T>(result: Result<T>): T {
  if (result.ok) {
    return result.value;
  }
  throw result.error;
}
