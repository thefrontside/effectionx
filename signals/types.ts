import type { Stream } from "effection";

export interface SettableValue<T> extends Settable<T>, ValueStream<T> {}

export interface ValueStream<T> extends Stream<T, void> {
  valueOf(): T;
}

export interface Settable<T> {
  set(value: T): T;
}
