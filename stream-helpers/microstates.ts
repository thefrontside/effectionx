import { createSignal, each, Operation, resource, type Stream } from "effection";
import { List } from 'immutable';

interface ListState<T> extends Stream<List<T>, void> {
  push(item: T): List<T>;
  shift(): List<T>;
  toArray(): Array<T>;
  clear(): List<T>;
  size: number;
  value: List<T>;
  first(): T | undefined;
  is(predicate: (list: List<T>) => boolean): Operation<void>
} 

export function createListState<T>(initial: Iterable<T>) {
  return resource<ListState<T>>(function*(provide) {
    const signal = createSignal<List<T>, void>();
    const ref = {
      current: List.of<T>(...initial)
    }

    try {
      yield* provide({
        [Symbol.iterator]: signal[Symbol.iterator],
        push(item) {
          ref.current = ref.current.push(item);
          signal.send(ref.current);
          return ref.current;
        },
        shift() {
          ref.current = ref.current.shift();
          signal.send(ref.current);
          return ref.current;
        },
        clear() {
          ref.current = ref.current.clear();
          signal.send(ref.current);
          return ref.current;
        },
        first() {
          return ref.current.first();
        },
        toArray() {
          return ref.current.toArray();
        },
        get value() {
          return ref.current;
        },
        get size() {
          return ref.current.size
        },
        *is(predicate) {
          if (predicate(ref.current)) {
            return;
          }
          for (const value of yield* each(signal)) {
            if (predicate(value)) {
              return;
            }
            yield* each.next();
          }
        }
      })
    } finally {
      signal.close();
    }
  });
}