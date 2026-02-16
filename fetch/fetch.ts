import {
  stream,
  type Api,
  type Operation,
  type Stream,
  createApi,
  until,
  useAbortSignal,
} from "effection";

/**
 * Request options for fetch, excluding `signal` since cancellation
 * is handled automatically via Effection's structured concurrency.
 */
export type FetchInit = Omit<RequestInit, "signal"> & { signal?: never };

/**
 * Chainable fetch operation that supports fluent API.
 *
 * Can be yielded directly to get a {@link FetchResponse}, or chained
 * with methods like `.json()`, `.text()`, `.body()` for direct consumption.
 *
 * @example
 * ```ts
 * // Fluent API - single yield*
 * let data = yield* fetch("/api/users").json();
 *
 * // With validation - throws HttpError on non-2xx
 * let data = yield* fetch("/api/users").expect().json();
 *
 * // Traditional API - get response first
 * let response = yield* fetch("/api/users");
 * let data = yield* response.json();
 * ```
 */
export interface FetchOperation extends Operation<FetchResponse> {
  /** Parse response body as JSON. */
  json<T = unknown>(): Operation<T>;
  /** Parse response body as JSON with a custom parser. */
  json<T>(parse: (value: unknown) => T): Operation<T>;
  /** Get response body as text. */
  text(): Operation<string>;
  /** Get response body as ArrayBuffer. */
  arrayBuffer(): Operation<ArrayBuffer>;
  /** Get response body as Blob. */
  blob(): Operation<Blob>;
  /** Get response body as FormData. */
  formData(): Operation<FormData>;
  /** Stream response body as chunks. */
  body(): Stream<Uint8Array, void>;
  /** Return a new FetchOperation that throws {@link HttpError} on non-2xx responses. */
  expect(): FetchOperation;
}

/**
 * Effection wrapper around the native {@link Response} object.
 *
 * Provides operation-based methods for consuming the response body,
 * and exposes common response properties.
 */
export interface FetchResponse {
  /** The underlying native Response object. */
  readonly raw: Response;
  /** Whether the response body has been consumed. */
  readonly bodyUsed: boolean;
  /** Whether the response status is in the 200-299 range. */
  readonly ok: boolean;
  /** The HTTP status code. */
  readonly status: number;
  /** The HTTP status message. */
  readonly statusText: string;
  /** The response headers. */
  readonly headers: Headers;
  /** The final URL after redirects. */
  readonly url: string;
  /** Whether the response was redirected. */
  readonly redirected: boolean;
  /** The response type (e.g., "basic", "cors"). */
  readonly type: ResponseType;
  /** Parse response body as JSON. */
  json<T = unknown>(): Operation<T>;
  /** Parse response body as JSON with a custom parser. */
  json<T>(parse: (value: unknown) => T): Operation<T>;
  /** Get response body as text. */
  text(): Operation<string>;
  /** Get response body as ArrayBuffer. */
  arrayBuffer(): Operation<ArrayBuffer>;
  /** Get response body as Blob. */
  blob(): Operation<Blob>;
  /** Get response body as FormData. */
  formData(): Operation<FormData>;
  /** Stream response body as chunks. */
  body(): Stream<Uint8Array, void>;
  /** Throw {@link HttpError} if response is not ok (non-2xx status). */
  expect(): Operation<this>;
}

/**
 * Error thrown when an HTTP response has a non-2xx status code.
 *
 * Thrown by {@link FetchOperation.expect} and {@link FetchResponse.expect}
 * when the response is not ok.
 */
export class HttpError extends Error {
  readonly name = "HttpError";
  /** The HTTP status code. */
  readonly status: number;
  /** The HTTP status message. */
  readonly statusText: string;
  /** The request URL. */
  readonly url: string;
  /** The response that triggered this error. */
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

/**
 * Core interface for the fetch API operations.
 * Used internally by createApi to enable middleware support.
 */
interface FetchApiCore {
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
 * Use `fetchApi.around()` to add middleware for logging, mocking, or instrumentation.
 * Middleware intercepts the actual HTTP request operation, not the FetchOperation builder.
 *
 * @example
 * ```ts
 * import { fetchApi, fetch } from "@effectionx/fetch";
 * import { run } from "effection";
 *
 * await run(function*() {
 *   // Add logging middleware
 *   yield* fetchApi.around({
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
 * import { fetchApi, fetch, createMockResponse } from "@effectionx/fetch";
 *
 * await run(function*() {
 *   yield* fetchApi.around({
 *     *fetch(args, next) {
 *       let [input] = args;
 *       if (input === "/api/users") {
 *         // Return a mock response
 *         return createMockResponse({ users: [] });
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
export const fetchApi: Api<FetchApiCore> = createApi("fetch", {
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
 * Perform an HTTP request using the Fetch API with Effection structured concurrency.
 *
 * Cancellation is automatically handled via the current Effection scope.
 * When the scope exits, the request is aborted.
 *
 * This function supports middleware via {@link fetchApi}. Use `fetchApi.around()`
 * to add logging, mocking, or other middleware that will intercept all fetch calls.
 *
 * @param input - The URL or Request object
 * @param init - Optional request configuration (same as RequestInit, but without signal)
 * @returns A chainable {@link FetchOperation}
 *
 * @example
 * ```ts
 * // Simple GET request
 * let data = yield* fetch("https://api.example.com/users").json();
 *
 * // POST request with body
 * let result = yield* fetch("https://api.example.com/users", {
 *   method: "POST",
 *   headers: { "Content-Type": "application/json" },
 *   body: JSON.stringify({ name: "Alice" }),
 * }).expect().json();
 *
 * // Stream response body
 * for (let chunk of yield* each(fetch("/large-file").body())) {
 *   console.log(chunk.length);
 *   yield* each.next();
 * }
 * ```
 *
 * @example
 * ```ts
 * // Use middleware to mock responses in tests
 * import { fetchApi, fetch, createMockResponse } from "@effectionx/fetch";
 *
 * await run(function*() {
 *   yield* fetchApi.around({
 *     *fetch(args, next) {
 *       let [input] = args;
 *       if (input === "/api/test") {
 *         // Return a mock response
 *         return createMockResponse({ data: "mocked" });
 *       }
 *       return yield* next(...args);
 *     }
 *   });
 *
 *   // This call uses the mock
 *   let data = yield* fetch("/api/test").json();
 * });
 * ```
 */
export function fetch(
  input: RequestInfo | URL,
  init?: FetchInit,
): FetchOperation {
  return createFetchOperation(input, init, false);
}

function createFetchOperation(
  input: RequestInfo | URL,
  init: FetchInit | undefined,
  shouldExpect: boolean,
): FetchOperation {
  // Use the API's fetch operation so middleware can intercept
  function* doFetch(): Operation<FetchResponse> {
    return yield* fetchApi.operations.fetch(input, init, shouldExpect);
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

/**
 * Create a FetchResponse from a native Response object.
 *
 * Useful for creating mock responses in middleware for testing.
 *
 * @example
 * ```ts
 * import { createMockResponse } from "@effectionx/fetch";
 *
 * // Create a mock JSON response
 * let mock = createMockResponse({ users: [] });
 * ```
 */
export function createMockResponse(data: unknown): FetchResponse {
  let response = new Response(JSON.stringify(data), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
  return createFetchResponse(response);
}

function createFetchResponse(response: Response): FetchResponse {
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
