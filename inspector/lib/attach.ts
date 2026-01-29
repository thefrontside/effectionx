import { type Operation, type Scope, suspend, withResolvers } from "effection";
import type { Methods, Inspector, Handle } from "./types.ts";
import { useLabels } from "./labels.ts";

export function* attach<M extends Methods>(
  scope: Scope,
  inspector: Inspector<M>,
  init: (handle: Handle<M>) => Operation<void>,
): Operation<void> {
  let attached = withResolvers<void>();

  scope.run(function* () {
    yield* useLabels({ name: "Inspector" });
    try {
      let handle = yield* inspector.attach(scope);
      yield* init(handle);
      attached.resolve();
      yield* suspend();
    } catch (error) {
      attached.reject(error as Error);
    }
  });

  return yield* attached.operation;
}
