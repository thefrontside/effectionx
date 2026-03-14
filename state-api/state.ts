import {
  type Api,
  type Operation,
  type Stream,
  createSignal,
  resource,
} from "effection";
import { createApi } from "effection/experimental";

/**
 * A map of reducer functions: `(state, ...args) => newState`
 *
 * Each reducer takes the current state as the first argument,
 * followed by any additional arguments, and returns the new state.
 */
// biome-ignore lint/suspicious/noExplicitAny: reducer args must be open-ended
export type ReducerMap<T> = Record<string, (state: T, ...args: any[]) => T>;

/**
 * Strip the leading `state` parameter from a reducer function,
 * leaving only the user-facing arguments.
 */
type ActionArgs<F> = F extends (state: never, ...args: infer A) => unknown
  ? A
  : never;

/**
 * The core handler object that gets passed to `createApi`.
 *
 * Built-in operations (`set`, `update`, `get`) plus
 * one operation per user-defined reducer action.
 */
type CoreHandlers<T, R extends ReducerMap<T>> = {
  set(value: T): Operation<T>;
  update(updater: (value: T) => T): Operation<T>;
  get(): Operation<T>;
} & {
  [K in keyof R]: (...args: ActionArgs<R[K]>) => Operation<T>;
};

/**
 * A reactive state container with middleware support.
 *
 * Provides built-in `set`, `update`, and `get` operations,
 * plus any user-defined reducer actions. All operations return
 * `Operation<T>` where `T` is the state type, yielding the
 * resulting state after the operation.
 *
 * Also implements `Stream<T, void>` so you can subscribe to
 * state changes using `each`.
 */
export type State<T, R extends ReducerMap<T> = Record<never, never>> = Stream<
  T,
  void
> & {
  /** Replace the current state. Returns the new state. */
  set(value: T): Operation<T>;
  /** Transform the current state. Returns the new state. */
  update(updater: (value: T) => T): Operation<T>;
  /** Read the current state. */
  get(): Operation<T>;
  /** Install middleware on this state container. */
  around: Api<CoreHandlers<T, R>>["around"];
} & {
  [K in keyof R]: (...args: ActionArgs<R[K]>) => Operation<T>;
};

/**
 * Create a reactive state container.
 *
 * @param initial - The initial state value
 * @returns An `Operation` that yields a `State<T>` container
 *
 * @example Basic usage
 * ```ts
 * const counter = yield* useState(0);
 *
 * yield* counter.set(42);
 * yield* counter.update(n => n + 1);
 * const value = yield* counter.get();
 * ```
 */
export function useState<T>(initial: T): Operation<State<T>>;

/**
 * Create a reactive state container with typed reducer actions.
 *
 * @param initial - The initial state value
 * @param reducers - An object of named reducer functions.
 *   Each reducer takes `(state, ...args)` and returns a new state.
 *   The `state` parameter is injected automatically — callers
 *   only pass the remaining arguments.
 * @returns An `Operation` that yields a `State<T, R>` container
 *
 * @example With reducers
 * ```ts
 * interface Todo { id: number; text: string; done: boolean; }
 *
 * const todos = yield* useState([] as Todo[], {
 *   add: (state, text: string) => [
 *     ...state,
 *     { id: state.length, text, done: false },
 *   ],
 *   toggle: (state, id: number) =>
 *     state.map(t => t.id === id ? { ...t, done: !t.done } : t),
 *   remove: (state, id: number) =>
 *     state.filter(t => t.id !== id),
 * });
 *
 * const afterAdd = yield* todos.add("buy milk");
 * const afterToggle = yield* todos.toggle(0);
 * ```
 *
 * @example With middleware
 * ```ts
 * yield* todos.around({
 *   *add([text], next) {
 *     console.log("Adding:", text);
 *     return yield* next(text);
 *   },
 * });
 * ```
 */
export function useState<T, R extends ReducerMap<T>>(
  initial: T,
  reducers: R,
): Operation<State<T, R>>;

// biome-ignore lint/suspicious/noExplicitAny: overload implementation
export function useState<T>(initial: T, reducers?: any): Operation<any> {
  return resource(function* (provide) {
    const signal = createSignal<T, void>();
    const ref = { current: initial };

    // Build the core handler object for createApi.
    // Built-in operations: set, update, get
    // biome-ignore lint/suspicious/noExplicitAny: dynamic handler construction
    const core: Record<string, (...args: any[]) => Operation<T>> = {
      *set(value: T): Operation<T> {
        ref.current = value;
        signal.send(value);
        return ref.current;
      },
      *update(updater: (value: T) => T): Operation<T> {
        ref.current = updater(ref.current);
        signal.send(ref.current);
        return ref.current;
      },
      *get(): Operation<T> {
        return ref.current;
      },
    };

    // Add user-defined reducer actions
    if (reducers) {
      for (const key of Object.keys(reducers)) {
        const reducer = reducers[key];
        // biome-ignore lint/suspicious/noExplicitAny: reducer args are open-ended
        core[key] = function* (...args: any[]): Operation<T> {
          ref.current = reducer(ref.current, ...args);
          signal.send(ref.current);
          return ref.current;
        };
      }
    }

    // biome-ignore lint/suspicious/noExplicitAny: dynamic core object
    const api = createApi("state", core as any);

    // Build the flattened State object
    const state = {
      // Stream interface
      [Symbol.iterator]: signal[Symbol.iterator],
      // Middleware
      around: api.around,
      // Spread all operations (set, update, valueOf, + reducers)
      ...api.operations,
      // biome-ignore lint/suspicious/noExplicitAny: cast to match overload return type
    } as any;

    try {
      yield* provide(state);
    } finally {
      signal.close();
    }
  });
}
