import type { Callable, Operation, Result } from "npm:effection@3.0.3";
import { call, Err, Ok } from "npm:effection@3.0.3";

/**
 * The goal of `safe` is to wrap Operations to prevent them from raising
 * and error.  The result of `safe` is always a {@link Result} type.
 *
 * @example
 * ```ts
 * import { safe } from "starfx";
 *
 * function* run() {
 *  const results = yield* safe(fetch("api.com"));
 *  if (result.ok) {
 *    console.log(result.value);
 *  } else {
 *    console.error(result.error);
 *  }
 * }
 * ```
 */
function isError(error: unknown): error is Error {
  return error instanceof Error;
}

export function* safe<T>(operator: Callable<T>): Operation<Result<T>> {
  try {
    // deno-lint-ignore no-explicit-any
    const value = yield* call<T>(operator as any);
    return Ok(value);
  } catch (error) {
    return Err(isError(error) ? error : new Error(String(error)));
  }
}
