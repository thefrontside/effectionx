import {
  type Operation,
  type Scope,
  suspend,
  useAttributes,
  withResolvers,
} from "effection";
import type { Methods, Inspector, Handle } from "./types.ts";

export function* attach<M extends Methods>(
  scope: Scope,
  inspector: Inspector<M>,
  init: (handle: Handle<M>) => Operation<void>,
): Operation<() => Operation<void>> {
  let attached = withResolvers<void>();

  let task = scope.run(function* () {
    yield* useAttributes({ name: "Inspector" });
    try {
      let handle = yield* inspector.attach(scope);
      yield* init(handle);
      attached.resolve();
      yield* suspend();
    } catch (error) {
      attached.reject(error as Error);
    }
  });

  yield* attached.operation;

  return task.halt;
}
