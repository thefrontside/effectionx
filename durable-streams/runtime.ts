/**
 * DurableRuntime — platform-agnostic runtime abstraction for durable effects.
 *
 * Effects must not depend on Node-specific or Deno-specific APIs directly.
 * This interface provides all platform operations. Every I/O method returns
 * `Operation<T>`, not `Promise<T>`. Cancellation flows through Effection's
 * structured concurrency — when a scope tears down, the operation is
 * cancelled. No `AbortSignal` in the interface.
 *
 * Install via `scope.set(DurableRuntimeCtx, nodeRuntime())` before calling
 * `durableRun`. Effects access the runtime inside `createDurableOperation`
 * callbacks via `scope.expect<DurableRuntime>(DurableRuntimeCtx)`.
 */

import { createContext } from "effection";
import type { Context, Operation } from "effection";

/**
 * Minimal response headers interface.
 *
 * Uses a minimal interface instead of the global `Headers` type to avoid
 * requiring DOM lib types in tsconfig.
 */
export interface ResponseHeaders {
  get(key: string): string | null;
}

/**
 * Response shape returned by `DurableRuntime.fetch()`.
 *
 * Both the response object and `text()` are Operation-native — no Promises
 * cross the interface boundary.
 */
export interface RuntimeFetchResponse {
  status: number;
  headers: ResponseHeaders;
  /** Read the response body as text. */
  text(): Operation<string>;
}

/**
 * Platform-agnostic runtime for durable effects.
 *
 * Implementations exist for Node.js (`nodeRuntime()` in `@effectionx/durable-effects`)
 * and testing (`stubRuntime()` in `@effectionx/durable-effects`).
 */
export interface DurableRuntime {
  /** Execute a subprocess. Cancellation kills the process. */
  exec(options: {
    command: string[];
    cwd?: string;
    env?: Record<string, string>;
    timeout?: number;
  }): Operation<{ exitCode: number; stdout: string; stderr: string }>;

  /** Read a text file. */
  readTextFile(path: string): Operation<string>;

  /** Expand glob patterns. Returns relative paths with isFile flag. */
  glob(options: {
    patterns: string[];
    root: string;
    exclude?: string[];
  }): Operation<Array<{ path: string; isFile: boolean }>>;

  /** Make an HTTP request. Cancellation aborts the request. */
  fetch(
    input: string,
    init?: {
      method?: string;
      headers?: Record<string, string>;
      body?: string;
      timeout?: number;
    },
  ): Operation<RuntimeFetchResponse>;

  /** Read an environment variable. Returns undefined if not set. */
  env(name: string): string | undefined;

  /** Return platform information. */
  platform(): { os: string; arch: string };
}

/**
 * Effection Context for the DurableRuntime.
 *
 * Set on the scope before calling `durableRun()`. Effects access the
 * runtime via `scope.expect<DurableRuntime>(DurableRuntimeCtx)`.
 */
export const DurableRuntimeCtx: Context<DurableRuntime> =
  createContext<DurableRuntime>("@effectionx/durable-streams/runtime");
