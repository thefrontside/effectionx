import {
  stream,
  type Operation,
  type Stream,
  until,
  useAbortSignal,
} from "effection";

/**
 * Chainable fetch operation that supports fluent API.
 *
 * @example
 * ```ts
 * // Fluent API - single yield*
 * let data = yield* fetch("/api/users").json();
 *
 * // With validation
 * let data = yield* fetch("/api/users").expect().json();
 *
 * // Traditional API - still works
 * let response = yield* fetch("/api/users");
 * let data = yield* response.json();
 * ```
 */
export interface FetchOperation extends Operation<FetchResponse> {
  json<T = unknown>(): Operation<T>;
  json<T>(parse: (value: unknown) => T): Operation<T>;
  text(): Operation<string>;
  arrayBuffer(): Operation<ArrayBuffer>;
  blob(): Operation<Blob>;
  formData(): Operation<FormData>;
  body(): Stream<Uint8Array, void>;
  expect(): FetchOperation;
}

export interface FetchResponse {
  readonly raw: Response;
  readonly bodyUsed: boolean;
  readonly ok: boolean;
  readonly status: number;
  readonly statusText: string;
  readonly headers: Headers;
  readonly url: string;
  readonly redirected: boolean;
  readonly type: ResponseType;
  json<T = unknown>(): Operation<T>;
  json<T>(parse: (value: unknown) => T): Operation<T>;
  text(): Operation<string>;
  arrayBuffer(): Operation<ArrayBuffer>;
  blob(): Operation<Blob>;
  formData(): Operation<FormData>;
  body(): Stream<Uint8Array, void>;
  expect(): Operation<this>;
}

export class HttpError extends Error {
  readonly name = "HttpError";
  readonly status: number;
  readonly statusText: string;
  readonly url: string;
  readonly response: FetchResponse;

  constructor(
    status: number,
    statusText: string,
    url: string,
    response: FetchResponse,
  ) {
    super(`HTTP ${status}: ${statusText}`);
    Object.setPrototypeOf(this, new.target.prototype);
    this.status = status;
    this.statusText = statusText;
    this.url = url;
    this.response = response;
  }
}

export function fetch(
  input: RequestInfo | URL,
  init?: RequestInit,
): FetchOperation {
  return createFetchOperation(input, init, false);
}

function createFetchOperation(
  input: RequestInfo | URL,
  init: RequestInit | undefined,
  shouldExpect: boolean,
): FetchOperation {
  function* doFetch(): Operation<FetchResponse> {
    let scopeSignal = yield* useAbortSignal();

    let signal = init?.signal
      ? AbortSignal.any([init.signal, scopeSignal])
      : scopeSignal;

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
  }

  return {
    *[Symbol.iterator]() {
      return yield* doFetch();
    },

    *json<T = unknown>(parse?: (value: unknown) => T): Operation<T> {
      let response = yield* doFetch();
      return yield* response.json(parse as (value: unknown) => T);
    },

    *text(): Operation<string> {
      let response = yield* doFetch();
      return yield* response.text();
    },

    *arrayBuffer(): Operation<ArrayBuffer> {
      let response = yield* doFetch();
      return yield* response.arrayBuffer();
    },

    *blob(): Operation<Blob> {
      let response = yield* doFetch();
      return yield* response.blob();
    },

    *formData(): Operation<FormData> {
      let response = yield* doFetch();
      return yield* response.formData();
    },

    body(): Stream<Uint8Array, void> {
      // For body(), we need to return a Stream that performs fetch when iterated
      return {
        *[Symbol.iterator]() {
          let response = yield* doFetch();
          return yield* response.body();
        },
      };
    },

    expect(): FetchOperation {
      return createFetchOperation(input, init, true);
    },
  };
}

function createFetchResponse(response: Response): FetchResponse {
  let consumed = false;

  let guardBody = () => {
    if (consumed || response.bodyUsed) {
      throw new Error("Body has already been consumed");
    }
    consumed = true;
  };

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
      return consumed || response.bodyUsed;
    },
    get raw() {
      return response;
    },
    *json<T = unknown>(parse?: (value: unknown) => T): Operation<T> {
      guardBody();
      let value: unknown = yield* until(response.json());
      return parse ? parse(value) : (value as T);
    },
    *text(): Operation<string> {
      guardBody();
      return yield* until(response.text());
    },
    *arrayBuffer(): Operation<ArrayBuffer> {
      guardBody();
      return yield* until(response.arrayBuffer());
    },
    *blob(): Operation<Blob> {
      guardBody();
      return yield* until(response.blob());
    },
    *formData(): Operation<FormData> {
      guardBody();
      return yield* until(response.formData());
    },
    body(): Stream<Uint8Array, void> {
      guardBody();
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
