/**
 * A function that wraps another function call, with access to the
 * arguments and the ability to delegate to the next link in the chain.
 *
 * @example
 * ```ts
 * import type { Middleware } from "@effectionx/middleware";
 *
 * const logger: Middleware<[string], string> = (args, next) => {
 *   console.log("calling with", args);
 *   const result = next(...args);
 *   console.log("returned", result);
 *   return result;
 * };
 * ```
 */
export type Middleware<TArgs extends unknown[], TReturn> = (
  args: TArgs,
  next: (...args: TArgs) => TReturn,
) => TReturn;

/**
 * Compose an array of middleware into a single middleware.
 *
 * Middlewares execute left-to-right: the first middleware in the array
 * is the outermost (runs first), and the last is the innermost
 * (runs just before `next`).
 *
 * @example
 * ```ts
 * import { combine } from "@effectionx/middleware";
 * import type { Middleware } from "@effectionx/middleware";
 *
 * const logger: Middleware<[string], string> = (args, next) => {
 *   console.log("calling with", args);
 *   return next(...args);
 * };
 *
 * const stack = combine([logger]);
 * const result = stack(["hello"], (s) => s.toUpperCase());
 * ```
 */
export function combine<TArgs extends unknown[], TReturn>(
  middlewares: Middleware<TArgs, TReturn>[],
): Middleware<TArgs, TReturn> {
  if (middlewares.length === 0) {
    return (args, next) => next(...args);
  }
  return middlewares.reduceRight(
    (inner, middleware) => (args, next) =>
      middleware(args, (...args) => inner(args, next)),
  );
}
