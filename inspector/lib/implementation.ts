import type { Operation, Scope } from "effection";
import type {
  Handle,
  Implementation,
  Inspector,
  Methods,
  Protocol,
} from "./types.ts";

export function createImplementation<M extends Methods>(
  protocol: Protocol<M>,
  create: Implementation<M>,
): Inspector<M> {
  return {
    protocol,
    *attach(scope: Scope): Operation<Handle<M>> {
      let methods = yield* create(scope);
      return {
        protocol,
        methods,
        invoke: ({ name, args }) => methods[name](...args),
      };
    },
  };
}
