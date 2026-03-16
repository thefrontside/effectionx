import { type Api, createApi } from "@effectionx/context-api";
import { type Operation, until, useAbortSignal } from "effection";

import { createFetchResponse } from "./create-fetch-response.ts";
import { type FetchInit, type FetchResponse, HttpError } from "./fetch.ts";

/**
 * Core interface for the fetch API operations.
 * Used internally by createApi to enable middleware support.
 */
export interface FetchApiCore {
  /**
   * Perform an HTTP fetch operation.
   * This is the core operation that middleware can intercept.
   */
  fetch(
    input: RequestInfo | URL,
    init: FetchInit | undefined,
    shouldExpect: boolean,
  ): Operation<FetchResponse>;
}

/**
 * The fetch API object that supports middleware decoration.
 *
 * Use `FetchApi.around()` to add middleware for logging, mocking, or instrumentation.
 * Middleware intercepts the actual HTTP request operation, not the FetchOperation builder.
 *
 * @example
 * ```ts
 * import { FetchApi, fetch } from "@effectionx/fetch";
 * import { run } from "effection";
 *
 * await run(function*() {
 *   // Add logging middleware
 *   yield* FetchApi.around({
 *     *fetch(args, next) {
 *       let [input, init] = args;
 *       console.log("Fetching:", input);
 *       return yield* next(...args);
 *     }
 *   });
 *
 *   // All fetch calls in this scope now log
 *   let data = yield* fetch("/api/users").json();
 * });
 * ```
 *
 * @example
 * ```ts
 * // Mock responses for testing
 * import { FetchApi, fetch, createFetchResponse } from "@effectionx/fetch";
 *
 * await run(function*() {
 *   yield* FetchApi.around({
 *     *fetch(args, next) {
 *       let [input] = args;
 *       if (input === "/api/users") {
 *         return createFetchResponse(
 *           new Response(JSON.stringify({ users: [] }), {
 *             status: 200,
 *             headers: { "Content-Type": "application/json" },
 *           }),
 *         );
 *       }
 *       return yield* next(...args);
 *     }
 *   });
 *
 *   // Fetch returns mocked data in this scope
 *   let users = yield* fetch("/api/users").json();
 * });
 * ```
 */
export const FetchApi: Api<FetchApiCore> = createApi("fetch", {
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

/**
 * Core fetch operation from {@link FetchApi}.
 *
 * Used internally by the `fetch()` builder. Prefer the public `fetch()`
 * function for typical usage.
 */
export const coreFetch = FetchApi.operations.fetch;
