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

export function createApi<A extends {}>(name: string, handler: A): Api<A> {
  let fields = Object.keys(handler) as (keyof A)[];

  let initial = fields.reduce(
    (sum, field) => {
      return Object.assign(sum, {
        [field]: {
          max: [],
          min: [],
          composed: undefined,
        } satisfies FieldMiddleware,
      });
    },
    {} as MiddlewareRegistry<A>,
  );

  let context = createContext<MiddlewareRegistry<A>>(`$api:${name}`, initial);

  let operations = fields.reduce(
    (api, field) => {
      let handle = handler[field];
      if (typeof handle === "function") {
        let fn = handle as (...args: any[]) => any;
        return Object.assign(api, {
          [field]: function* (...args: any[]) {
            let state = yield* context.expect();
            let { composed } = state[field as keyof A];
            return yield* composed ? composed(args, fn) : fn(...args);
          },
        });
      }
      return Object.assign(api, {
        [field]: {
          *[Symbol.iterator]() {
            let state = yield* context.expect();
            let { composed } = state[field as keyof A];
            return composed
              ? yield* composed([], () => handle)
              : yield* handle as Operation<unknown>;
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
        let middleware = (middlewares as any)[field] as
          | Middleware<any[], any>
          | undefined;
        let fieldState = current[field as keyof A];

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
      {} as MiddlewareRegistry<A>,
    );

    yield* context.set(next);
  }

  return { operations, around };
}
