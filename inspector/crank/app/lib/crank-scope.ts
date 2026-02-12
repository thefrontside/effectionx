import type { Context as Crank } from "@b9g/crank";
import { createScope, each, type Stream } from "effection";

export interface Ref<T> {
  value: T;
}

export interface CrankScope {
  bind<T>(stream: Stream<T, unknown>, initial: T): Ref<T>;
}

export function createCrankScope(crank: Crank): CrankScope {
  let [scope, destroy] = createScope();

  crank.cleanup(destroy);

  return {
    bind<T>(stream: Stream<T, unknown>, initial: T): Ref<T> {
      let ref: { value: T } = { value: initial };
      scope.run(function* () {
        for (let item of yield* each(stream)) {
          ref.value = item;
          crank.refresh();
          yield* each.next();
        }
      });
      return ref;
    },
  };
}
