import { type Operation, until } from "npm:effection@3.6.0";
import { createApi } from "npm:@effectionx/context-api@0.0.2";

export interface FetchOperations {
  fetch: (url: string, options?: RequestInit) => Operation<Response>;
}

const defaultFetch: FetchOperations = {
  *fetch(url: string, options?: RequestInit) {
    return yield* until(globalThis.fetch(url, options));
  },
};

export const fetchApi = createApi("fetch", defaultFetch);
export const { fetch } = fetchApi.operations;
