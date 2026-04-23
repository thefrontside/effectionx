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

/**
 * How repeated registrations inside a group are ordered.
 *
 * - `"append"` — earlier registrations run outer (like the default `"max"` lane).
 *   Across scopes, this means parent-outer / child-inner.
 * - `"prepend"` — later registrations run outer (like the default `"min"` lane).
 *   Across scopes, this means child-outer / parent-inner.
 */
export type GroupMode = "append" | "prepend";

/**
 * A user-declared middleware group for a {@link createApi} instance.
 *
 * `mode` defaults to `"append"` when omitted.
 */
export type MiddlewareGroup<Name extends string> = {
  name: Name;
  mode?: GroupMode;
};

/**
 * Options accepted by {@link createApi}.
 *
 * `groups` defaults to the backward-compatible two-lane configuration:
 * `[{ name: "max", mode: "append" }, { name: "min", mode: "prepend" }]`.
 */
export type CreateApiOptions<Group extends string> = {
  groups?: readonly MiddlewareGroup<Group>[];
};

export interface Api<A, Group extends string = "max" | "min"> {
  operations: Operations<A>;
  around: (
    around: Partial<Around<A>>,
    options?: { at: Group },
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

type GroupDefinition<Group extends string> = {
  name: Group;
  mode: GroupMode;
};

type ScopeMiddleware<A, Group extends string> = Record<
  Group,
  Partial<Around<A>>[]
>;

const DEFAULT_GROUPS: readonly MiddlewareGroup<"max" | "min">[] = [
  { name: "max", mode: "append" },
  { name: "min", mode: "prepend" },
];

export function createApi<A extends {}, Group extends string = "max" | "min">(
  name: string,
  handler: A,
  options?: CreateApiOptions<Group>,
): Api<A, Group> {
  let fields = Object.keys(handler) as (keyof A)[];

  let rawGroups = (options?.groups ??
    DEFAULT_GROUPS) as readonly MiddlewareGroup<Group>[];

  if (rawGroups.length === 0) {
    throw new Error(`context-api "${name}": \`groups\` must not be empty`);
  }

  let seen = new Set<string>();
  let duplicates: string[] = [];
  let groups: readonly GroupDefinition<Group>[] = Object.freeze(
    rawGroups.map((g) => {
      if (seen.has(g.name)) {
        duplicates.push(g.name);
      }
      seen.add(g.name);
      return Object.freeze({
        name: g.name,
        mode: g.mode ?? "append",
      }) as GroupDefinition<Group>;
    }),
  );

  if (duplicates.length > 0) {
    let unique = Array.from(new Set(duplicates));
    throw new Error(
      `context-api "${name}": duplicate group name${unique.length === 1 ? "" : "s"}: ${unique.join(", ")}`,
    );
  }

  let groupByName = new Map<string, GroupDefinition<Group>>(
    groups.map((g) => [g.name, g]),
  );

  function emptyState(): ScopeMiddleware<A, Group> {
    let state = {} as ScopeMiddleware<A, Group>;
    for (let g of groups) {
      state[g.name] = [];
    }
    return state;
  }

  function cloneState(
    current: ScopeMiddleware<A, Group>,
  ): ScopeMiddleware<A, Group> {
    let next = {} as ScopeMiddleware<A, Group>;
    for (let g of groups) {
      next[g.name] = [...(current[g.name] ?? [])];
    }
    return next;
  }

  let context = createContext<ScopeMiddleware<A, Group>>(
    `$api:${name}`,
    emptyState(),
  );

  let operations = fields.reduce(
    (api, field) => {
      let handle = handler[field];
      if (typeof handle === "function") {
        let fn = handle as (...args: any[]) => any;
        return Object.assign(api, {
          [field]: (...args: any[]) => ({
            *[Symbol.iterator]() {
              let scope = yield* useScope();
              let middlewares = collectMiddleware(
                scope,
                context,
                field,
                groups,
              );
              let stack = combine(middlewares);
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
            let middlewares = collectMiddleware(scope, context, field, groups);
            let stack = combine(middlewares);
            let result = stack([], () => handle);
            return isOperation(result) ? yield* result : result;
          },
        },
      });
    },
    {} as Operations<A>,
  );

  function* around(
    middlewares: Partial<Around<A>>,
    options?: { at: Group },
  ): Operation<void> {
    let hasAny = fields.some((field) => Boolean((middlewares as any)[field]));
    if (!hasAny) {
      return;
    }

    let at = options?.at ?? groups[0].name;
    let group = groupByName.get(at);
    if (!group) {
      let known = Array.from(groupByName.keys()).join(", ");
      throw new Error(
        `context-api "${name}": unknown group "${at}". Known groups: ${known}`,
      );
    }

    let scope = yield* useScope();
    let current = scope.hasOwn(context) ? scope.expect(context) : emptyState();

    let next = cloneState(current);

    if (group.mode === "prepend") {
      next[group.name] = [middlewares, ...next[group.name]];
    } else {
      next[group.name] = [...next[group.name], middlewares];
    }

    scope.set(context, next);
  }

  return { operations, around };
}

function collectMiddleware<A extends {}, Group extends string>(
  scope: Scope,
  context: { name?: string; key?: string },
  field: keyof A,
  groups: readonly GroupDefinition<Group>[],
): Middleware<any[], any>[] {
  let key = contextName(context);
  let window = contextWindow(scope);

  let lanes: Record<string, Middleware<any[], any>[]> = {};
  for (let g of groups) {
    lanes[g.name] = [];
  }

  reducePrototypeChain(
    window,
    (_, current) => {
      if (!Object.prototype.hasOwnProperty.call(current, key)) {
        return null;
      }

      let state = current[key] as ScopeMiddleware<A, Group>;

      for (let g of groups) {
        let fromScope = (state[g.name] ?? []).flatMap((around) => {
          let middleware = (around as any)[field] as
            | Middleware<any[], any>
            | undefined;
          return middleware ? [middleware] : [];
        });
        if (g.mode === "append") {
          // parent outer / child inner — walking child→parent,
          // parent scopes are encountered last so unshift accumulates
          // in parent-outer-first order.
          lanes[g.name].unshift(...fromScope);
        } else {
          // child outer / parent inner — walking child→parent, child
          // scopes are encountered first so push accumulates in
          // child-outer-first order.
          lanes[g.name].push(...fromScope);
        }
      }

      return null;
    },
    null,
  );

  let out: Middleware<any[], any>[] = [];
  for (let g of groups) {
    out.push(...lanes[g.name]);
  }
  return out;
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
