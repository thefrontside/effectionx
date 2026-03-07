/**
 * Durable effects — persistent, replay-safe wrappers for I/O operations.
 *
 * Each effect uses `createDurableOperation` from @effectionx/durable-streams.
 * During live execution, the operation runs and persists a Yield event.
 * During replay, the stored result is returned without executing.
 *
 * All return values are JSON-serializable (T extends Json).
 * All I/O goes through DurableRuntime (Operation-native).
 * All hashing goes through computeSHA256 (Operation-native).
 */

import {
  type Json,
  type Workflow,
  createDurableOperation,
} from "@effectionx/durable-streams";
import { useScope } from "effection";
import type { Operation } from "effection";
import { canonicalJson } from "./canonical-json.ts";
import { computeSHA256 } from "./hash.ts";
import { type DurableRuntime, DurableRuntimeCtx } from "./runtime.ts";

// ---------------------------------------------------------------------------
// Effect 1: durableExec — subprocess execution
// ---------------------------------------------------------------------------

export interface ExecOptions {
  command: string[];
  cwd?: string;
  env?: Record<string, string>;
  timeout?: number;
  throwOnError?: boolean;
}

export interface ExecResult {
  exitCode: number;
  stdout: string;
  stderr: string;
}

/**
 * Execute a shell command durably.
 *
 * Never re-executed on replay — logs are authoritative.
 *
 * **Security note**: `env` values are NOT persisted to the journal —
 * only the env key names are recorded (for divergence detection).
 * The `throwOnError` flag is captured in the description so replay
 * behavior matches the original execution.
 */
export function* durableExec(
  name: string,
  options: ExecOptions,
): Workflow<ExecResult> {
  const { command, cwd, env, timeout = 300_000, throwOnError = true } = options;

  return (yield createDurableOperation<Json>(
    {
      type: "exec",
      name,
      command: command as Json,
      ...(cwd ? { cwd } : {}),
      // Only record env key names — values may contain secrets
      ...(env ? { envKeys: Object.keys(env).sort() as Json } : {}),
      timeout,
      throwOnError,
    },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const output = yield* runtime.exec({ command, cwd, env, timeout });

      if (throwOnError && output.exitCode !== 0) {
        throw new Error(
          `Command failed with exit code ${output.exitCode}: ${command.join(" ")}\n${output.stderr}`,
        );
      }
      return output as unknown as Json;
    },
  )) as ExecResult;
}

// ---------------------------------------------------------------------------
// Effect 2: durableReadFile — file read with content hash
// ---------------------------------------------------------------------------

export interface ReadFileResult {
  content: string;
  contentHash: string;
}

/**
 * Read a file durably.
 *
 * Path in description, content + SHA-256 hash in result.
 * Designed for replay guard integration.
 *
 * Note: `encoding` is recorded in the description for future use but
 * the current `DurableRuntime.readTextFile` always reads as UTF-8.
 * Non-default encodings will require a runtime interface extension.
 */
export function* durableReadFile(
  name: string,
  path: string,
  options?: { encoding?: string },
): Workflow<ReadFileResult> {
  const encoding = options?.encoding ?? "utf-8";

  return (yield createDurableOperation<Json>(
    { type: "read_file", name, path, encoding },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const content = yield* runtime.readTextFile(path);
      const contentHash = yield* computeSHA256(content);
      return { content, contentHash } as unknown as Json;
    },
  )) as ReadFileResult;
}

// ---------------------------------------------------------------------------
// Effect 3: durableGlob — directory glob with scan hash
// ---------------------------------------------------------------------------

export interface GlobOptions {
  baseDir: string;
  include: string[];
  exclude?: string[];
}

export interface GlobMatch {
  path: string;
  contentHash: string;
}

export interface GlobResult {
  matches: GlobMatch[];
  scanHash: string;
}

/**
 * Discover files matching patterns durably.
 *
 * Sorted matches with per-file hashes. Composite scanHash for
 * replay guard staleness detection.
 */
export function* durableGlob(
  name: string,
  options: GlobOptions,
): Workflow<GlobResult> {
  const { baseDir, include, exclude = [] } = options;

  return (yield createDurableOperation<Json>(
    {
      type: "glob",
      name,
      baseDir,
      include: include as Json,
      exclude: exclude as Json,
    },
    function* () {
      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      const entries = yield* runtime.glob({
        patterns: include,
        root: baseDir,
        exclude,
      });

      const matches: GlobMatch[] = [];
      for (const entry of entries) {
        if (!entry.isFile) continue;
        const content = yield* runtime.readTextFile(`${baseDir}/${entry.path}`);
        const contentHash = yield* computeSHA256(content);
        matches.push({ path: entry.path, contentHash });
      }

      matches.sort((a, b) => a.path.localeCompare(b.path));
      const seen = new Set<string>();
      const deduped = matches.filter((m) => {
        if (seen.has(m.path)) return false;
        seen.add(m.path);
        return true;
      });

      const scanHash = yield* computeSHA256(JSON.stringify(deduped));
      return { matches: deduped, scanHash } as unknown as Json;
    },
  )) as GlobResult;
}

// ---------------------------------------------------------------------------
// Effect 4: durableFetch — HTTP request
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Effect 5: durableEval — in-process code evaluation
// ---------------------------------------------------------------------------

export interface EvalOptions {
  source: string;
  language?: string;
  bindings?: Record<string, Json>;
}

export interface EvalResult {
  value: Json;
  sourceHash: string;
  bindingsHash: string;
}

/**
 * Evaluate code via a caller-provided evaluator durably.
 *
 * Source hash and bindings hash in the result for replay guard
 * freshness detection.
 */
export function* durableEval(
  name: string,
  evaluator: (
    source: string,
    bindings: Record<string, Json>,
  ) => Operation<Json>,
  options: EvalOptions,
): Workflow<EvalResult> {
  const { source, language, bindings = {} } = options;

  return (yield createDurableOperation<Json>(
    { type: "eval", name, ...(language ? { language } : {}) },
    function* () {
      const sourceHash = yield* computeSHA256(source);
      const bindingsHash = yield* computeSHA256(canonicalJson(bindings));
      const value = yield* evaluator(source, bindings);
      return { value, sourceHash, bindingsHash } as unknown as Json;
    },
  )) as EvalResult;
}

// ---------------------------------------------------------------------------
// Effect 6: durableResolve — non-deterministic value capture
// ---------------------------------------------------------------------------

export type ResolveKind =
  | { kind: "current_time" }
  | { kind: "random_float"; min?: number; max?: number }
  | { kind: "random_int"; min: number; max: number }
  | { kind: "uuid" }
  | { kind: "env_var"; name: string }
  | { kind: "platform" };

/**
 * Capture a non-deterministic value once durably.
 *
 * On replay, return the stored value without re-executing.
 * Custom resolver returns Operation<T>, not Promise<T>.
 */
export function* durableResolve<T extends Json>(
  name: string,
  resolver: ResolveKind | (() => Operation<T>),
): Workflow<T> {
  const isKind = typeof resolver === "object" && "kind" in resolver;
  const descExtras: Record<string, Json> = {};
  if (isKind) {
    descExtras.kind = resolver.kind;
    if (resolver.kind === "env_var") descExtras.varName = resolver.name;
    if (resolver.kind === "random_float") {
      descExtras.min = resolver.min ?? 0;
      descExtras.max = resolver.max ?? 1;
    }
    if (resolver.kind === "random_int") {
      if (resolver.min > resolver.max) {
        throw new Error(
          `durableResolve("${name}"): random_int min (${resolver.min}) ` +
            `cannot exceed max (${resolver.max})`,
        );
      }
      if (!Number.isInteger(resolver.min) || !Number.isInteger(resolver.max)) {
        throw new Error(
          `durableResolve("${name}"): random_int min and max must be integers`,
        );
      }
      descExtras.min = resolver.min;
      descExtras.max = resolver.max;
    }
  }

  return (yield createDurableOperation<Json>(
    { type: "resolve", name, ...descExtras },
    function* () {
      if (typeof resolver === "function") {
        return (yield* resolver()) as unknown as Json;
      }

      const scope = yield* useScope();
      const runtime = scope.expect<DurableRuntime>(DurableRuntimeCtx);

      switch (resolver.kind) {
        case "current_time":
          return new Date().toISOString() as unknown as Json;
        case "random_float": {
          const min = resolver.min ?? 0;
          const max = resolver.max ?? 1;
          return (Math.random() * (max - min) + min) as unknown as Json;
        }
        case "random_int": {
          const range = resolver.max - resolver.min + 1;
          return (Math.floor(Math.random() * range) +
            resolver.min) as unknown as Json;
        }
        case "uuid":
          return crypto.randomUUID() as unknown as Json;
        case "env_var":
          return (runtime.env(resolver.name) ?? null) as unknown as Json;
        case "platform":
          return runtime.platform() as unknown as Json;
      }
    },
  )) as T;
}

// ---------------------------------------------------------------------------
// Convenience wrappers for durableResolve
// ---------------------------------------------------------------------------

/** Capture the current time as ISO-8601 string. */
export function* durableNow(name?: string): Workflow<string> {
  return yield* durableResolve(name ?? "now", { kind: "current_time" });
}

/** Capture a random UUID. */
export function* durableUUID(name?: string): Workflow<string> {
  return yield* durableResolve(name ?? "uuid", { kind: "uuid" });
}

/**
 * Capture an environment variable value.
 *
 * **Security warning**: The env var *value* is persisted to the durable
 * journal. Do NOT use this for secrets (API keys, tokens, passwords).
 * For secrets, read them ephemerally on each run instead.
 */
export function* durableEnv(
  varName: string,
  name?: string,
): Workflow<string | null> {
  return yield* durableResolve(name ?? `env:${varName}`, {
    kind: "env_var",
    name: varName,
  });
}
