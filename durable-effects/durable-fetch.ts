/**
 * Durable fetch — persistent, replay-safe HTTP request.
 *
 * Uses `createDurableOperation` from @effectionx/durable-streams.
 * During live execution, the operation runs and persists a Yield event.
 * During replay, the stored result is returned without executing.
 */

import {
  type Json,
  type Workflow,
  createDurableOperation,
} from "@effectionx/durable-streams";
import { useScope } from "effection";
import { computeSHA256 } from "./hash.ts";
import { type DurableRuntime, DurableRuntimeCtx } from "./runtime.ts";

export interface FetchOptions {
  url: string;
  method?: string;
  headers?: Record<string, string>;
  body?: string;
  timeout?: number;
}

export interface FetchResult {
  status: number;
  headers: Record<string, string>;
  body: string;
  bodyHash: string;
}

/** Header names that are safe to record in the journal. */
const SAFE_REQUEST_HEADERS = new Set([
  "content-type",
  "accept",
  "accept-language",
  "cache-control",
  "user-agent",
]);

/**
 * HTTP request durably.
 *
 * HTTP error status codes (404, 500) are successful effect results —
 * only network failures are effect errors.
 *
 * **Security note**: Only safe request header *names* are recorded in
 * the description — values of sensitive headers (Authorization, Cookie,
 * etc.) are never persisted. A body hash is included in the description
 * when a request body is present, so different payloads to the same URL
 * produce distinct journal entries.
 */
export function* durableFetch(
  name: string,
  options: FetchOptions,
): Workflow<FetchResult> {
  const { url, method = "GET", headers = {}, body, timeout = 30_000 } = options;

  // Record only safe header names + values; redact sensitive ones to key-only
  const safeHeaders: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lower = key.toLowerCase();
    if (SAFE_REQUEST_HEADERS.has(lower)) {
      safeHeaders[key] = value;
    } else {
      safeHeaders[key] = "[REDACTED]";
    }
  }

  return (yield createDurableOperation<Json>(
    {
      type: "fetch",
      name,
      url,
      method,
      headers: safeHeaders as Json,
      // Include body hash so different payloads produce distinct entries
      ...(body ? { bodyHash: `len:${body.length}` } : {}),
    },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const response = yield* runtime.fetch(url, {
        method,
        headers,
        body,
        timeout,
      });
      const responseBody = yield* response.text();
      const bodyHash = yield* computeSHA256(responseBody);

      // Filter response headers to keep only useful ones
      const responseHeaders: Record<string, string> = {};
      for (const key of [
        "content-type",
        "etag",
        "last-modified",
        "cache-control",
      ]) {
        const val = response.headers.get(key);
        if (val) responseHeaders[key] = val;
      }

      return {
        status: response.status,
        headers: responseHeaders,
        body: responseBody,
        bodyHash,
      } as unknown as Json;
    },
  )) as FetchResult;
}
