import { type Middleware, combine } from "@effectionx/middleware";
import { type Operation, type Scope, createContext, useScope } from "effection";

export type { Middleware };

/**
 * The middleware type for a single property of an {@link Api}.
 *
 * Function members get middleware matching their signature.
 * Value members get middleware wrapping a no-arg accessor.
 *
 * Use this to type helper functions that accept or return middleware
 * for a specific key of an API without reconstructing the mapping
 * from {@link Around} by hand.
 */
export type PropertyMiddleware<A, K extends keyof A> = A[K] extends (
  ...args: infer TArgs
) => infer TReturn
  ? Middleware<TArgs, TReturn>
  : Middleware<[], A[K]>;

/**
 * The shape of middlewares that can surround a particular {@link Api}.
 */
export type Around<A> = {
  [K in keyof A]: PropertyMiddleware<A, K>;
};

export interface Api<A> {
  operations: Operations<A>;
  around: (
    around: Partial<Around<A>>,
    options?: { at: "min" | "max" },
  ) => Operation<void>;
  /**
   * Invoke one operation with the final continuation supplied by this call.
   *
   * The same stable-name middleware is collected, in the same `max`/`min`
   * order, and composed around the continuation given here instead of around
   * the handler `createApi()` was built with.
   *
   * The continuation stays in the caller's own lexical state: it is never
   * stored, never placed in a context, never part of the operation's public
   * arguments, and never reachable by the middleware composed around it. A
   * handler that returns without calling `next` does not reach it, and nested
   * or concurrent calls each reach their own.
   *
   * ```ts
   * let api = createApi("greet", { *hello(name: string) { return `hi ${name}`; } });
   *
   * // Public middleware still runs; this call ends somewhere else.
   * yield* api.terminating.hello(function* (name) {
   *   return `HELLO ${name}`;
   * })("world");
   * ```
   */
  terminating: Terminating<A>;
}

/**
 * The per-call terminal form of each function member.
 *
 * Value members have no arguments to intercept and no continuation to supply,
 * so they are not terminable.
 */
export type Terminating<A> = {
  [K in keyof A]: A[K] extends (...args: infer TArgs) => infer TReturn
    ? (terminal: (...args: TArgs) => TReturn) => Operations<A>[K]
    : never;
};

/**
 * Maps each member of an API core to its lifted Operation form.
 *
 * - `Operation<T>` → pass-through as `Operation<T>`
 * - `(...args) => Operation<T>` → pass-through
 * - `(...args) => T` (sync) → lifted to `(...args) => Operation<T>`
 * - `T` (constant) → lifted to `Operation<T>`
 *
 * The `Operation<unknown>` check comes first to prevent Operations
 * (which have `[Symbol.iterator]`) from being misclassified as functions.
 */
export type Operations<A> = {
  [K in keyof A]: A[K] extends Operation<unknown>
    ? A[K]
    : A[K] extends (...args: infer TArgs) => infer TReturn
      ? TReturn extends Operation<unknown>
        ? A[K]
        : (...args: TArgs) => Operation<TReturn>
      : Operation<A[K]>;
};

type ScopeMiddleware<A> = {
  max: Partial<Around<A>>[];
  min: Partial<Around<A>>[];
};

type MiddlewareStack = {
  max: Middleware<any[], any>[];
  min: Middleware<any[], any>[];
};

export function createApi<A extends {}>(name: string, handler: A): Api<A> {
  let fields = Object.keys(handler) as (keyof A)[];
  let context = createContext<ScopeMiddleware<A>>(`$api:${name}`, {
    max: [],
    min: [],
  });

  let operations = fields.reduce(
    (api, field) => {
      let handle = handler[field];
      if (typeof handle === "function") {
        let fn = handle as (...args: any[]) => any;
        return Object.assign(api, {
          [field]: (...args: any[]) => ({
            *[Symbol.iterator]() {
              let scope = yield* useScope();
              let { max, min } = collectMiddleware(scope, context, field);
              let stack = combine([...max, ...min]);
              let result = stack(args, fn);
              return isOperation(result) ? yield* result : result;
            },
          }),
        });
      }
      return Object.assign(api, {
        [field]: {
          *[Symbol.iterator]() {
            let scope = yield* useScope();
            let { max, min } = collectMiddleware(scope, context, field);
            let stack = combine([...max, ...min]);
            let result = stack([], () => handle);
            return isOperation(result) ? yield* result : result;
          },
        },
      });
    },
    {} as Operations<A>,
  );

  let terminating = fields.reduce(
    (api, field) => {
      if (typeof handler[field] !== "function") {
        return api;
      }
      return Object.assign(api, {
        [field]:
          (terminal: (...args: any[]) => any) =>
          (...args: any[]) => ({
            *[Symbol.iterator]() {
              let scope = yield* useScope();
              let { max, min } = collectMiddleware(scope, context, field);
              let stack = combine([...max, ...min]);
              // Identical to `operations`, except for the base the public stack
              // is applied to. Collection, ordering and delegation are the same,
              // so middleware cannot tell which base is underneath it — and
              // cannot reach it.
              let result = stack(args, terminal);
              return isOperation(result) ? yield* result : result;
            },
          }),
      });
    },
    {} as Terminating<A>,
  );

  function* around(
    middlewares: Partial<Around<A>>,
    options: { at: "min" | "max" } = { at: "max" },
  ): Operation<void> {
    let hasAny = fields.some((field) => Boolean((middlewares as any)[field]));
    if (!hasAny) {
      return;
    }

    let scope = yield* useScope();
    let current = scope.hasOwn(context)
      ? scope.expect(context)
      : { max: [], min: [] };

    let next: ScopeMiddleware<A> = {
      max: [...current.max],
      min: [...current.min],
    };

    if (options.at === "min") {
      next.min = [middlewares, ...next.min];
    } else {
      next.max.push(middlewares);
    }

    scope.set(context, next);
  }

  return { operations, around, terminating };
}

function collectMiddleware<A extends {}>(
  scope: Scope,
  context: { name?: string; key?: string },
  field: keyof A,
): MiddlewareStack {
  let key = contextName(context);
  let window = contextWindow(scope);

  return reducePrototypeChain(
    window,
    (sum, current) => {
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        return sum;
      }

      let state = current[key] as ScopeMiddleware<A>;

      let max = state.max.flatMap((around) => {
        let middleware = (around as any)[field] as
          | Middleware<any[], any>
          | undefined;
        return middleware ? [middleware] : [];
      });
      let min = state.min.flatMap((around) => {
        let middleware = (around as any)[field] as
          | Middleware<any[], any>
          | undefined;
        return middleware ? [middleware] : [];
      });

      sum.max.unshift(...max);
      sum.min.push(...min);
      return sum;
    },
    { max: [], min: [] } as MiddlewareStack,
  );
}

function reducePrototypeChain<T>(
  start: Record<string, unknown>,
  reducer: (sum: T, current: Record<string, unknown>) => T,
  initial: T,
): T {
  let sum = initial;
  let current: Record<string, unknown> | null = start;
  while (current) {
    sum = reducer(sum, current);
    current = Object.getPrototypeOf(current);
  }
  return sum;
}

function contextName(context: { name?: string; key?: string }): string {
  return context.name ?? context.key ?? "";
}

function contextWindow(scope: Scope): Record<string, unknown> {
  let maybe = scope as Scope & {
    contexts?: unknown;
    frame?: { context?: unknown };
  };

  if (isRecord(maybe.contexts)) {
    return maybe.contexts;
  }
  if (isRecord(maybe.frame?.context)) {
    return maybe.frame.context;
  }

  throw new Error(
    "Unsupported Effection scope internals: expected scope.contexts (v4) or scope.frame.context (v3)",
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/**
 * Check if a value is an Effection Operation at runtime.
 *
 * Excludes native iterables (strings, arrays, Maps, Sets) which have
 * `[Symbol.iterator]` but are not Operations.
 */
function isOperation<T>(target: Operation<T> | T): target is Operation<T> {
  return (
    target != null &&
    !isNativeIterable(target) &&
    typeof (target as Operation<T>)[Symbol.iterator] === "function"
  );
}

function isNativeIterable(target: unknown): boolean {
  return (
    typeof target === "string" ||
    Array.isArray(target) ||
    target instanceof Map ||
    target instanceof Set
  );
}
