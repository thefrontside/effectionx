import type { Operation } from "effection";
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
    *attach(): Operation<Handle<M>> {
      let methods = yield* create();
      return {
        protocol,
        methods,
        invoke: ({ name, args }) => methods[name](...args),
      };
    },
  };
}
