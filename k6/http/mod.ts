/**
 * Effection wrappers for K6 HTTP operations.
 *
 * These wrappers turn K6's synchronous HTTP functions into Effection
 * operations that integrate with structured concurrency, enabling:
 * - Proper context preservation across HTTP calls
 * - Structured error propagation
 * - Integration with group() for metrics attribution
 *
 * @example
 * ```typescript
 * import { main, group, withGroup, http } from '@effectionx/k6';
 *
 * export default main(function*() {
 *   yield* group('api-tests');
 *   yield* withGroup('users', function*() {
 *     const response = yield* http.get('https://api.example.com/users');
 *     console.log(response.status); // 200
 *   });
 * });
 * ```
 *
 * @packageDocumentation
 */

import { type Operation, call } from "effection";
import type {
  RefinedResponse,
  ResponseType,
  RefinedParams,
  RequestBody,
} from "k6/http";
import * as k6Http from "k6/http";
import { useTags } from "../lib/tags.ts";

type HttpURL = ReturnType<typeof k6Http.url>;

/**
 * Parameters for HTTP requests, extending K6's params with
 * Effection-specific options.
 */
export interface HttpParams<RT extends ResponseType | undefined>
  extends RefinedParams<RT> {}

/**
 * Merges context tags with request params.
 */
function* mergeContextTags<RT extends ResponseType | undefined>(
  params?: HttpParams<RT>,
): Operation<RefinedParams<RT> | undefined> {
  const contextTags = yield* useTags();

  // Per-request tags override context tags
  const requestTags = (params as RefinedParams<RT>)?.tags ?? {};

  return {
    ...params,
    tags: {
      ...contextTags,
      ...requestTags,
    },
  } as RefinedParams<RT>;
}

/**
 * HTTP GET request as an Effection operation.
 *
 * Wraps k6/http.get() with group context tagging.
 *
 * @param url - The URL to request
 * @param params - Optional request parameters
 * @returns The HTTP response
 *
 * @example
 * ```typescript
 * yield* withGroup('users', function*() {
 *   const res = yield* http.get('https://api.example.com/users');
 *   // Request is automatically tagged with group: 'users'
 * });
 * ```
 */
export function* get<RT extends ResponseType | undefined = undefined>(
  url: string | HttpURL,
  params?: HttpParams<RT>,
): Operation<RefinedResponse<RT>> {
  const taggedParams = yield* mergeContextTags(params);
  return yield* call(() => k6Http.get<RT>(url, taggedParams));
}

/**
 * HTTP POST request as an Effection operation.
 *
 * @param url - The URL to request
 * @param body - Request body (string, object, ArrayBuffer, etc.)
 * @param params - Optional request parameters
 * @returns The HTTP response
 *
 * @example
 * ```typescript
 * yield* withGroup('create-user', function*() {
 *   const res = yield* http.post('https://api.example.com/users', JSON.stringify({
 *     name: 'Test User',
 *     email: 'test@example.com',
 *   }), {
 *     headers: { 'Content-Type': 'application/json' },
 *   });
 * });
 * ```
 */
export function* post<RT extends ResponseType | undefined = undefined>(
  url: string | HttpURL,
  body?: RequestBody | null,
  params?: HttpParams<RT>,
): Operation<RefinedResponse<RT>> {
  const taggedParams = yield* mergeContextTags(params);
  return yield* call(() => k6Http.post<RT>(url, body, taggedParams));
}

/**
 * HTTP PUT request as an Effection operation.
 *
 * @param url - The URL to request
 * @param body - Request body
 * @param params - Optional request parameters
 * @returns The HTTP response
 */
export function* put<RT extends ResponseType | undefined = undefined>(
  url: string | HttpURL,
  body?: RequestBody | null,
  params?: HttpParams<RT>,
): Operation<RefinedResponse<RT>> {
  const taggedParams = yield* mergeContextTags(params);
  return yield* call(() => k6Http.put<RT>(url, body, taggedParams));
}

/**
 * HTTP PATCH request as an Effection operation.
 *
 * @param url - The URL to request
 * @param body - Request body
 * @param params - Optional request parameters
 * @returns The HTTP response
 */
export function* patch<RT extends ResponseType | undefined = undefined>(
  url: string | HttpURL,
  body?: RequestBody | null,
  params?: HttpParams<RT>,
): Operation<RefinedResponse<RT>> {
  const taggedParams = yield* mergeContextTags(params);
  return yield* call(() => k6Http.patch<RT>(url, body, taggedParams));
}

/**
 * HTTP DELETE request as an Effection operation.
 *
 * @param url - The URL to request
 * @param body - Optional request body
 * @param params - Optional request parameters
 * @returns The HTTP response
 */
export function* del<RT extends ResponseType | undefined = undefined>(
  url: string | HttpURL,
  body?: RequestBody | null,
  params?: HttpParams<RT>,
): Operation<RefinedResponse<RT>> {
  const taggedParams = yield* mergeContextTags(params);
  return yield* call(() => k6Http.del<RT>(url, body, taggedParams));
}

/**
 * HTTP HEAD request as an Effection operation.
 *
 * @param url - The URL to request
 * @param params - Optional request parameters
 * @returns The HTTP response
 */
export function* head<RT extends ResponseType | undefined = undefined>(
  url: string | HttpURL,
  params?: HttpParams<RT>,
): Operation<RefinedResponse<RT>> {
  const taggedParams = yield* mergeContextTags(params);
  return yield* call(() => k6Http.head<RT>(url, taggedParams));
}

/**
 * HTTP OPTIONS request as an Effection operation.
 *
 * @param url - The URL to request
 * @param body - Optional request body
 * @param params - Optional request parameters
 * @returns The HTTP response
 */
export function* options<RT extends ResponseType | undefined = undefined>(
  url: string | HttpURL,
  body?: RequestBody | null,
  params?: HttpParams<RT>,
): Operation<RefinedResponse<RT>> {
  const taggedParams = yield* mergeContextTags(params);
  return yield* call(() => k6Http.options<RT>(url, body, taggedParams));
}

/**
 * Generic HTTP request as an Effection operation.
 *
 * Use this for custom HTTP methods or when you need full control.
 *
 * @param method - HTTP method (GET, POST, PUT, etc.)
 * @param url - The URL to request
 * @param body - Optional request body
 * @param params - Optional request parameters
 * @returns The HTTP response
 */
export function* request<RT extends ResponseType | undefined = undefined>(
  method: string,
  url: string | HttpURL,
  body?: RequestBody | null,
  params?: HttpParams<RT>,
): Operation<RefinedResponse<RT>> {
  const taggedParams = yield* mergeContextTags(params);
  return yield* call(() => k6Http.request<RT>(method, url, body, taggedParams));
}

/**
 * HTTP module namespace for convenient importing.
 *
 * @example
 * ```typescript
 * import { http } from '@effectionx/k6';
 *
 * yield* http.get('https://api.example.com/users');
 * yield* http.post('https://api.example.com/users', body);
 * ```
 */
export const http = {
  get,
  post,
  put,
  patch,
  del,
  head,
  options,
  request,
} as const;
