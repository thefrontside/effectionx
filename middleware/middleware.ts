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
 * A stack that manages middleware with min/max priority ordering.
 *
 * - `max` middleware runs outermost (closest to caller, first to execute)
 * - `min` middleware runs innermost (closest to core, last before core)
 * - Within each priority, insertion order is preserved
 *
 * The execution order for a stack with max middlewares [M1, M2] and
 * min middlewares [m1, m2] is: `M1 → M2 → m1 → m2 → core`
 */
export interface MiddlewareStack<TArgs extends unknown[], TReturn> {
  /** Register middleware. Defaults to `"max"` (outermost). */
  use(
    middleware: Middleware<TArgs, TReturn>,
    options?: { at: "min" | "max" },
  ): void;

  /**
   * Compose all registered middleware around a core function.
   * Returns a new function each time, reflecting the current stack state.
   */
  compose(core: (...args: TArgs) => TReturn): (...args: TArgs) => TReturn;
}

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

/**
 * Create a middleware stack with min/max priority ordering.
 *
 * @example
 * ```ts
 * import { createMiddlewareStack } from "@effectionx/middleware";
 *
 * const stack = createMiddlewareStack<[Request], Response>();
 *
 * // Runs outermost (default)
 * stack.use((args, next) => {
 *   console.log("before");
 *   const result = next(...args);
 *   console.log("after");
 *   return result;
 * });
 *
 * // Runs just before core
 * stack.use((args, next) => {
 *   args[0].headers.set("x-request-id", crypto.randomUUID());
 *   return next(...args);
 * }, { at: "min" });
 *
 * const handler = stack.compose(coreHandler);
 * ```
 */
export function createMiddlewareStack<
  TArgs extends unknown[],
  TReturn,
>(): MiddlewareStack<TArgs, TReturn> {
  const max: Middleware<TArgs, TReturn>[] = [];
  const min: Middleware<TArgs, TReturn>[] = [];

  return {
    use(middleware, options = { at: "max" }) {
      if (options.at === "min") {
        min.push(middleware);
      } else {
        max.push(middleware);
      }
    },
    compose(core) {
      const stack = combine([...max, ...min]);
      return (...args: TArgs) => stack(args, core);
    },
  };
}
