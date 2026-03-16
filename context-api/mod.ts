import { type Middleware, combine } from "@effectionx/middleware";
import { type Operation, createContext } from "effection";

export type { Middleware };

/**
 * The shape of middlewares that can surround a particular {@link Api}.
 *
 * Members that are functions get middleware matching their signature.
 * Members that are values get middleware wrapping a no-arg accessor.
 */
export type Around<A> = {
  [K in keyof A]: A[K] extends (...args: infer TArgs) => infer TReturn
    ? Middleware<TArgs, TReturn>
    : Middleware<[], A[K]>;
};

export interface Api<A> {
  operations: Operations<A>;
  around: (
    around: Partial<Around<A>>,
    options?: { at: "min" | "max" },
  ) => Operation<void>;
}

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

/**
 * Per-field middleware layers: two immutable arrays for priority ordering
 * plus a pre-composed middleware function.
 */
type FieldMiddleware = {
  max: Middleware<any[], any>[];
  min: Middleware<any[], any>[];
  composed: Middleware<any[], any> | undefined;
};

/**
 * Maps each API field to its middleware layers.
 */
type MiddlewareRegistry<A> = Record<keyof A, FieldMiddleware>;

export function createApi<A>(name: string, handler: A): Api<A> {
  let fields = Object.keys(handler as object) as (keyof A)[];

  let initial = fields.reduce((sum, field) => {
    return Object.assign(sum, {
      [field]: {
        max: [],
        min: [],
        composed: undefined,
      } satisfies FieldMiddleware,
    });
  }, {} as MiddlewareRegistry<A>);

  let context = createContext<MiddlewareRegistry<A>>(`$api:${name}`, initial);

  let operations = fields.reduce((api, field) => {
    let handle = handler[field];
    if (typeof handle === "function") {
      let fn = handle as (...args: any[]) => any;
      return Object.assign(api, {
        [field]: (...args: any[]) => ({
          *[Symbol.iterator]() {
            let state = yield* context.expect();
            let { composed } = state[field as keyof A];
            let result = composed ? composed(args, fn) : fn(...args);
            return isOperation(result) ? yield* result : result;
          },
        }),
      });
    }
    return Object.assign(api, {
      [field]: {
        *[Symbol.iterator]() {
          let state = yield* context.expect();
          let { composed } = state[field as keyof A];
          let result = composed ? composed([], () => handle) : handle;
          return isOperation(result) ? yield* result : result;
        },
      },
    });
  }, {} as Operations<A>);

  function* around(
    middlewares: Partial<Around<A>>,
    options: { at: "min" | "max" } = { at: "max" },
  ): Operation<void> {
    let current = yield* context.expect();

    let next = fields.reduce((sum, field) => {
      let middleware = (middlewares as any)[field] as
        | Middleware<any[], any>
        | undefined;
      let fieldState = current[field as keyof A];

      if (middleware) {
        // Clone arrays — never mutate in place (scope isolation)
        let max = [...fieldState.max];
        let min = [...fieldState.min];

        if (options.at === "min") {
          min = [middleware, ...min];
        } else {
          max = [...max, middleware];
        }

        let composed = combine([...max, ...min]);

        return Object.assign(sum, {
          [field]: { max, min, composed },
        });
      }

      return Object.assign(sum, { [field]: fieldState });
    }, {} as MiddlewareRegistry<A>);

    yield* context.set(next);
  }

  return { operations, around };
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
