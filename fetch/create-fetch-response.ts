import { stream, type Operation, type Stream, until } from "effection";

import { type FetchResponse, HttpError } from "./fetch.ts";

/**
 * Create a {@link FetchResponse} from a native `Response` object.
 *
 * Use this when writing middleware that needs to return a mock or
 * synthetic response without hitting the network.
 *
 * @example
 * ```ts
 * import { FetchApi, fetch, createFetchResponse } from "@effectionx/fetch";
 * import { run } from "effection";
 *
 * await run(function*() {
 *   yield* FetchApi.around({
 *     *fetch(args, next) {
 *       let [input] = args;
 *       if (String(input).includes("/api/users")) {
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
 *   let users = yield* fetch("/api/users").json();
 * });
 * ```
 */
export function createFetchResponse(response: Response): FetchResponse {
  let self: FetchResponse = {
    get ok() {
      return response.ok;
    },
    get status() {
      return response.status;
    },
    get statusText() {
      return response.statusText;
    },
    get headers() {
      return response.headers;
    },
    get url() {
      return response.url;
    },
    get redirected() {
      return response.redirected;
    },
    get type() {
      return response.type;
    },
    get bodyUsed() {
      return response.bodyUsed;
    },
    get raw() {
      return response;
    },
    *json<T = unknown>(parse?: (value: unknown) => T): Operation<T> {
      let value: unknown = yield* until(response.json());
      return parse ? parse(value) : (value as T);
    },
    *text(): Operation<string> {
      return yield* until(response.text());
    },
    *arrayBuffer(): Operation<ArrayBuffer> {
      return yield* until(response.arrayBuffer());
    },
    *blob(): Operation<Blob> {
      return yield* until(response.blob());
    },
    *formData(): Operation<FormData> {
      return yield* until(response.formData());
    },
    body(): Stream<Uint8Array, void> {
      if (!response.body) {
        throw new Error("Response has no body");
      }

      return stream(
        response.body as unknown as AsyncIterable<Uint8Array, void>,
      );
    },
    *expect(): Operation<FetchResponse> {
      if (!response.ok) {
        throw new HttpError(
          response.status,
          response.statusText,
          response.url,
          self,
        );
      }
      return self;
    },
  };

  return self;
}
