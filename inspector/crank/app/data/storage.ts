import { filter, map } from "@effectionx/stream-helpers";
import type { StandardSchemaV1 } from "@standard-schema/spec";
import {
  createSignal,
  each,
  on,
  resource,
  spawn,
  type Stream,
} from "effection";
import { pipe } from "remeda";
import { validateUnsafe } from "../../../lib/validate";

export interface LocalStorage<T> extends Stream<T, never> {
  value: T;
  update(fn: (current: T) => T): void;
}

export function createLocalStorage<T>(
  key: string,
  schema: StandardSchemaV1<T>,
  defaultValue: T,
): LocalStorage<T> {
  let value = decode(schema, localStorage.getItem(key), defaultValue);
  let signal = createSignal<T, never>();

  let stream: Stream<T, never> = resource(function* (provide) {
    let events = pipe(
      on(window, "storage"),
      filter(function* (event) {
        return event.key === key;
      }),
      map(function* (event) {
        return decode(schema, event.newValue, defaultValue);
      }),
    );

    yield* spawn(function* () {
      for (value of yield* each(events)) {
        signal.send(value);
        yield* each.next();
      }
    });

    yield* provide(yield* signal);
  });

  return {
    ...stream,
    get value() {
      return value;
    },
    update(fn) {
      let next = fn(value);
      validateUnsafe(schema, next);
      if (next !== value) {
        value = next;
        localStorage.setItem(key, JSON.stringify(value));
        signal.send(value);
      }
    },
  };
}

function decode<T>(
  schema: StandardSchemaV1<T>,
  item: string | null,
  defaultValue: T,
): T {
  if (item === null) {
    return defaultValue;
  }
  return validateUnsafe(schema, JSON.parse(item));
}
