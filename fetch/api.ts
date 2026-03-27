import { type Api, createApi } from "@effectionx/context-api";
import { type Operation, until, useAbortSignal } from "effection";

import { createFetchResponse } from "./create-fetch-response.ts";
import { type FetchInit, type FetchResponse, HttpError } from "./fetch.ts";

export interface Fetch {
  fetch(
    input: RequestInfo | URL,
    init: FetchInit | undefined,
    shouldExpect: boolean,
  ): Operation<FetchResponse>;
}

export const FetchApi: Api<Fetch> = createApi("fetch", {
  *fetch(
    input: RequestInfo | URL,
    init: FetchInit | undefined,
    shouldExpect: boolean,
  ): Operation<FetchResponse> {
    let signal = yield* useAbortSignal();
    let response = yield* until(globalThis.fetch(input, { ...init, signal }));
    let fetchResponse = createFetchResponse(response);

    if (shouldExpect && !response.ok) {
      throw new HttpError(
        response.status,
        response.statusText,
        response.url,
        fetchResponse,
      );
    }

    return fetchResponse;
  },
});

export const coreFetch = FetchApi.operations.fetch;
