import type { Operation, Stream } from "effection";

export type States = BooleanState | State<unknown>;

export interface ParentContextValue<T> {
  update: (value: T) => Operation<void>;
  initial: T | undefined;
}

export type BooleanState = {
  toggle(): Operation<boolean>;
} & State<boolean>;

export type NumberState = {
  increment(): Operation<number>;
  decrement(): Operation<number>;
} & State<number>;

export type State<T> = Stream<Initial<T>, Initial<T>> & {
  value: Initial<T>;
  set(value: T): Operation<T>;
};

export type ComposedState<T> = Yielded<T> & State<T>;

export type Yielded<T> = T extends object ? {
    [K in keyof T]: T[K] extends Operation<infer U> ? U : T[K];
  }
  : T extends Operation<infer U> ? U
  : T;

export type Initial<T> = T extends object ? {
    [K in keyof T]: T[K] extends Operation<infer U>
      ? U extends { value: infer V } ? V : never
      : never;
  }
  : T extends Operation<infer U> ? U extends { value: infer V } ? V : U
  : T;
