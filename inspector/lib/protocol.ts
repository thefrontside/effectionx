import type { Method, Protocol } from "./types.ts";

export function createProtocol<
  M extends Record<string, Method<unknown[], unknown, unknown>>,
>(methods: M): Protocol<M> {
  return {
    methods,
  };
}


