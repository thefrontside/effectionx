import { createSignal, type Operation, resource, type Stream } from "effection";
import { createBoolean } from "./boolean.ts";

export interface Faucet<T> extends Stream<T, never> {
  pour(items: Iterable<T>): Operation<void>;
  pour(op: () => Operation<Iterable<T>>): Operation<void>;
  open(): void;
  close(): void;
}

export interface FaucetOptions {
  open?: boolean;
}

export function createFaucet<T>(options: FaucetOptions): Operation<Faucet<T>> {
  return resource(function* (provide) {
    let signal = createSignal<T, never>();
    let open = yield* createBoolean(options.open);

    yield* provide({
      [Symbol.iterator]: signal[Symbol.iterator],
      *pour(itemsOrOp) {
        const items = typeof itemsOrOp === "function"
          ? yield* itemsOrOp()
          : itemsOrOp;
        for (let i of items) {
          yield* open.is(true);
          signal.send(i);
        }
      },
      close() {
        open.set(false);
      },
      open() {
        open.set(true);
      },
    });
  });
}
