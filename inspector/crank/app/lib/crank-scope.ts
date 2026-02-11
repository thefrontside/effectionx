import { createScope, type Scope } from "effection";

export function createCrankScope(): Scope & AsyncDisposable {
  let [scope, destroy] = createScope();
  Object.defineProperty(scope, Symbol.asyncDispose, {
    enumerable: false,
    value: destroy,
  });
  return scope as Scope & AsyncDisposable;
}
