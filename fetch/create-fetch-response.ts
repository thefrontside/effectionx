import { stream, type Operation, type Stream, until } from "effection";

import { type FetchResponse, HttpError } from "./fetch.ts";

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
