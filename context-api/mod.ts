import { type Middleware, combine } from "@effectionx/middleware";
import { type Operation, createContext } from "effection";

export type { Middleware };

export type Around<A> = {
  [K in keyof Operations<A>]: A[K] extends (
    ...args: infer TArgs
  ) => infer TReturn
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

export type Operations<T> = {
  [K in keyof T]: T[K] extends (...args: infer TArgs) => infer TReturn
    ? (...args: TArgs) => TReturn
    : T[K] extends Operation<infer TReturn>
      ? Operation<TReturn>
      : never;
};

/**
 * Internal per-field state: two immutable arrays for priority ordering
 * plus a pre-composed middleware function.
 */
type FieldState = {
  // biome-ignore lint/suspicious/noExplicitAny: Middleware arrays store heterogeneous field types
  max: Middleware<any[], any>[];
  // biome-ignore lint/suspicious/noExplicitAny: Middleware arrays store heterogeneous field types
  min: Middleware<any[], any>[];
  // biome-ignore lint/suspicious/noExplicitAny: Pre-composed middleware for dynamic dispatch
  composed: Middleware<any[], any>;
};

/**
 * The context stores a FieldState for each field in the API.
 */
type ContextState<A> = Record<keyof Operations<A>, FieldState>;

export function createApi<A extends {}>(name: string, handler: A): Api<A> {
  let fields = Object.keys(handler) as (keyof A & string)[];

  let initial = fields.reduce(
    (sum, field) => {
      return Object.assign(sum, {
        [field]: {
          max: [],
          min: [],
          // biome-ignore lint/suspicious/noExplicitAny: Passthrough middleware for initial state
          composed: (args: any, next: any) => next(...args),
        } satisfies FieldState,
      });
    },
    {} as ContextState<A>,
  );

  let context = createContext<ContextState<A>>(`$api:${name}`, initial);

  let operations = fields.reduce(
    (api, field) => {
      let handle = handler[field];
      if (typeof handle === "function") {
        // biome-ignore lint/suspicious/noExplicitAny: Handler is dynamically typed per field
        let fn = handle as (...args: any[]) => any;
        return Object.assign(api, {
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic field types
          [field]: function* (...args: any[]) {
            let state = yield* context.expect();
            let { composed } = state[field as keyof Operations<A>];
            return yield* composed(args, fn);
          },
        });
      }
      return Object.assign(api, {
        [field]: {
          *[Symbol.iterator]() {
            let state = yield* context.expect();
            let { composed } = state[field as keyof Operations<A>];
            return yield* composed([], () => handle);
          },
        },
      });
    },
    {} as Operations<A>,
  );

  function* around(
    middlewares: Partial<Around<A>>,
    options: { at: "min" | "max" } = { at: "max" },
  ): Operation<void> {
    let current = yield* context.expect();

    let next = fields.reduce(
      (sum, field) => {
        // biome-ignore lint/suspicious/noExplicitAny: Dynamic middleware types across fields
        let middleware = (middlewares as any)[field] as
          // biome-ignore lint/suspicious/noExplicitAny: Dynamic middleware types across fields
          Middleware<any[], any> | undefined;
        let fieldState = current[field as keyof Operations<A>];

        if (middleware) {
          // Clone arrays — never mutate in place (scope isolation)
          let max = [...fieldState.max];
          let min = [...fieldState.min];

          if (options.at === "min") {
            min = [...min, middleware];
          } else {
            max = [...max, middleware];
          }

          let composed = combine([...max, ...min]);

          return Object.assign(sum, {
            [field]: { max, min, composed },
          });
        }

        return Object.assign(sum, { [field]: fieldState });
      },
      {} as ContextState<A>,
    );

    yield* context.set(next);
  }

  return { operations, around };
}
