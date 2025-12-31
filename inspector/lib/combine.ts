// deno-lint-ignore-file no-explicit-any
import type { Operation } from "effection";
import type { Handle, Inspector, Methods, Protocol } from "./types.ts";

export interface Combine {
  protocols<A extends Methods>(...protocols: [Protocol<A>]): Protocol<A>;
  protocols<A extends Methods, B extends Methods>(
    ...protocols: [Protocol<A>, Protocol<B>]
  ): Protocol<A & B>;
  protocols<A extends Methods, B extends Methods, C extends Methods>(
    ...protocols: [Protocol<A>, Protocol<B>, Protocol<C>]
  ): Protocol<A & B & C>;
  protocols<
    A extends Methods,
    B extends Methods,
    C extends Methods,
    D extends Methods,
  >(
    ...protocols: [Protocol<A>, Protocol<B>, Protocol<C>, Protocol<D>]
  ): Protocol<A & B & C & D>;

  inspectors<A extends Methods>(...inspectors: [Inspector<A>]): Inspector<A>;
  inspectors<A extends Methods, B extends Methods>(
    ...inspectors: [Inspector<A>, Inspector<B>]
  ): Inspector<A & B>;
  inspectors<A extends Methods, B extends Methods, C extends Methods>(
    ...inspectors: [Inspector<A>, Inspector<B>, Inspector<C>]
  ): Inspector<A & B & C>;
  inspectors<
    A extends Methods,
    B extends Methods,
    C extends Methods,
    D extends Methods,
  >(
    ...inspectors: [Inspector<A>, Inspector<B>, Inspector<C>, Inspector<D>]
  ): Inspector<A & B & C & D>;
}

export const combine: Combine = {
  protocols: (...protocols: any[]) => {
    return protocols.reduce(
      (acc, protocol) => {
        Object.assign(acc.methods, protocol.methods);
        return acc;
      },
      { methods: {} },
    ) as Protocol<Methods>;
  },
  inspectors: (...inspectors: any[]) => {
    return inspectors.reduce(
      (acc: Inspector<Methods>, inspector: Inspector<Methods>) => {
        let protocol = combine.protocols(acc.protocol, inspector.protocol);
        let attach = function* (): Operation<Handle<Methods>> {
          let a = yield* acc.attach();
          let b = yield* inspector.attach();
          let methods = Object.assign({}, a.methods, b.methods);
          return {
            protocol,
            methods,
            invoke: ({ name, args }) => methods[name](...args),
          };
        };
        return { protocol, attach };
      },
    );
  },
};
