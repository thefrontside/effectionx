import {
  createSignal,
  each,
  type Operation,
  resource,
  type Stream,
} from "effection";
import { List, Set } from "immutable";

interface ValueStream<T> extends Stream<T, void> {
  valueOf(): T;
}

interface Settable<T> {
  set(value: T): T;
}

export interface SettableValue<T> extends Settable<T>, ValueStream<T> {}

interface ArraySignal<T> extends SettableValue<T[]> {
  push(item: T): number;
  shift(): Operation<T>;
  valueOf(): T[];
  get length(): number;
}

export function createArraySignal<T>(
  initial: Iterable<T>,
): Operation<ArraySignal<T>> {
  return resource(function* (provide) {
    const signal = createSignal<T[], void>();
    const ref = {
      current: List.of<T>(...initial),
    };

    const array: ArraySignal<T> = {
      [Symbol.iterator]: signal[Symbol.iterator],
      set(value) {
        ref.current = List.of<T>(...value);
        signal.send(ref.current.toArray());
        return ref.current.toArray();
      },
      push(item) {
        ref.current = ref.current.push(item);
        signal.send(ref.current.toArray());
        return ref.current.size;
      },
      *shift() {
        yield* is(array, (array) => array.length > 0);
        let value = ref.current.first();
        ref.current = ref.current.shift();
        signal.send(ref.current.toArray());
        return value!;
      },
      valueOf() {
        return ref.current.toArray();
      },
      get length() {
        return ref.current.size;
      },
    };

    try {
      yield* provide(array);
    } finally {
      signal.close();
    }
  });
}

export function* is<T>(
  array: ValueStream<T>,
  predicate: (item: T) => boolean,
) {
  const result = predicate(array.valueOf());
  if (result) {
    return;
  }
  for (const value of yield* each(array)) {
    const result = predicate(value);
    if (result) {
      return;
    }
    yield* each.next();
  }
}

export interface BooleanSignal extends SettableValue<boolean> {
}

export function createBoolean(initial: boolean = false) {
  return resource<BooleanSignal>(function* (provide) {
    const signal = createSignal<boolean, void>();

    const ref = { current: initial };

    try {
      yield* provide({
        [Symbol.iterator]: signal[Symbol.iterator],
        set(value) {
          if (value !== ref.current) {
            ref.current = value;

            signal.send(ref.current);
          }

          return ref.current;
        },
        valueOf() {
          return ref.current;
        },
      });
    } finally {
      signal.close();
    }
  });
}

interface SetSignal<T> extends SettableValue<Set<T>> {
  add(item: T): Set<T>;
  delete(item: T): boolean;
  difference(items: Iterable<T>): Set<T>;
  valueOf(): Set<T>;
}

export function createSetSignal<T>(initial: Array<T> = []) {
  return resource<SetSignal<T>>(function* (provide) {
    const signal = createSignal<Set<T>, void>();

    const ref = { current: Set.of<T>(...initial) };

    try {
      yield* provide({
        [Symbol.iterator]: signal[Symbol.iterator],
        set(value) {
          ref.current = Set.of<T>(...value);
          signal.send(ref.current.toSet());
          return ref.current;
        },
        add(item) {
          ref.current = ref.current.add(item);
          signal.send(ref.current.toSet());
          return ref.current.toSet();
        },
        difference(items) {
          ref.current = ref.current.subtract(items);
          signal.send(ref.current.toSet());
          return ref.current.toSet();
        },
        delete(item) {
          if (ref.current.has(item)) {  
            ref.current = ref.current.delete(item);
            signal.send(ref.current.toSet());
            return true;
          }
          return false;
        },
        valueOf() {
          return ref.current.toSet();
        },
      });
    } finally {
      signal.close();
    }
  });
}
